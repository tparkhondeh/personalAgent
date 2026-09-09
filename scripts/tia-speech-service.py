"""Private loopback ASR. No audio files, transcript logs, remote API or task writes."""
import hashlib
import hmac
import io
import json
import os
import pathlib
import threading
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MODEL_SHA = '6a564b5541920ce1c37bbc91d22e4b3a6838648b9b327eb88997e8db1f90950d'
MAX_BYTES = 1920044


def pcm_samples(body):
    if not 3244 <= len(body) <= MAX_BYTES:
        raise ValueError('size')
    with wave.open(io.BytesIO(body)) as audio:
        if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate(), audio.getcomptype()) != (1, 2, 16000, 'NONE'):
            raise ValueError('format')
        if not 1600 <= audio.getnframes() <= 960000:
            raise ValueError('duration')
        raw = audio.readframes(audio.getnframes())
        if len(raw) != audio.getnframes() * 2:
            raise ValueError('truncated')
        return raw


class SpeechServer(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 4

    def __init__(self, address, token, transcribe):
        super().__init__(address, Handler)
        self.token = token
        self.transcribe = transcribe
        self.inference = threading.BoundedSemaphore(1)
        self.clients = threading.BoundedSemaphore(4)

    def process_request(self, request, address):
        if not self.clients.acquire(blocking=False):
            request.close()
            return
        try:
            super().process_request(request, address)
        except Exception:
            self.clients.release()
            raise

    def process_request_thread(self, request, address):
        try:
            super().process_request_thread(request, address)
        finally:
            self.clients.release()

    def handle_error(self, request, client_address):
        # Do not log payload, headers, transcript or credentials.
        pass


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def setup(self):
        super().setup()
        self.connection.settimeout(15)

    def reply(self, status, data):
        payload = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Connection', 'close')
        self.end_headers()
        self.wfile.write(payload)

    def authorized(self):
        supplied = self.headers.get('Authorization', '')
        return hmac.compare_digest(supplied.encode(), ('Bearer ' + self.server.token).encode())

    def do_GET(self):
        if not self.authorized():
            return self.reply(401, {'error': 'unauthorized'})
        self.reply(200 if self.path == '/health' else 404, {'ready': self.path == '/health'})

    def do_POST(self):
        if not self.authorized():
            return self.reply(401, {'error': 'unauthorized'})
        if self.path != '/transcribe':
            return self.reply(404, {'error': 'not_found'})
        lengths = self.headers.get_all('Content-Length', [])
        if len(lengths) != 1 or not lengths[0].isdigit() or self.headers.get('Transfer-Encoding'):
            return self.reply(400, {'error': 'length'})
        length = int(lengths[0])
        if not 3244 <= length <= MAX_BYTES:
            return self.reply(413, {'error': 'size'})
        if self.headers.get('Content-Type') != 'audio/wav':
            return self.reply(415, {'error': 'format'})
        if not self.server.inference.acquire(blocking=False):
            return self.reply(429, {'error': 'busy'})
        try:
            body = self.rfile.read(length)
            if len(body) != length:
                raise ValueError('truncated')
            samples = pcm_samples(body)
            text = self.server.transcribe(samples).strip()[:2000]
            self.reply(200 if text else 422, {'text': text})
        except (ValueError, wave.Error, EOFError):
            self.reply(422, {'error': 'audio'})
        except TimeoutError:
            self.reply(408, {'error': 'timeout'})
        except Exception:
            self.reply(503, {'error': 'unavailable'})
        finally:
            self.server.inference.release()


def main():
    token = os.environ.get('ASR_INTERNAL_TOKEN', '')
    if len(token) < 32:
        raise RuntimeError('Private service token is required')
    directory = pathlib.Path(os.environ['ASR_MODEL_DIR'])
    with (directory / 'model.onnx').open('rb') as file:
        if hashlib.file_digest(file, 'sha256').hexdigest() != MODEL_SHA:
            raise RuntimeError('Model checksum mismatch')
    os.environ['OMP_NUM_THREADS'] = '2'
    import numpy as np
    import sherpa_onnx
    recognizer = sherpa_onnx.OfflineRecognizer.from_nemo_ctc(
        model=str(directory / 'model.onnx'), tokens=str(directory / 'tokens.txt'), num_threads=2)

    def transcribe(raw):
        values = np.frombuffer(raw, dtype='<i2').astype(np.float32) / 32768
        if np.sqrt(np.mean(values * values)) < 0.001:
            return ''
        stream = recognizer.create_stream()
        stream.accept_waveform(16000, values)
        recognizer.decode_stream(stream)
        return stream.result.text

    print('tia private speech service ready on loopback', flush=True)
    SpeechServer(('127.0.0.1', 3020), token, transcribe).serve_forever()


if __name__ == '__main__':
    main()
