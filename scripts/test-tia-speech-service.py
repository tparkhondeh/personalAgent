"""No model, network provider, user audio, or secrets needed."""
import importlib.util
import io
import pathlib
import struct
import threading
import unittest
import urllib.request
import urllib.error
import wave
spec=importlib.util.spec_from_file_location('speech',pathlib.Path(__file__).with_name('tia-speech-service.py'))
speech=importlib.util.module_from_spec(spec)
spec.loader.exec_module(speech)

class ServiceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.calls=[]
        cls.server=speech.SpeechServer(('127.0.0.1',0),'synthetic-test-token',lambda raw:cls.calls.append(len(raw)) or 'جلسه با تیم فروش')
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()
        output=io.BytesIO()
        with wave.open(output,'wb') as wav:
            wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(16000);wav.writeframes(struct.pack('<h',1000)*1600)
        cls.audio=output.getvalue()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close();cls.thread.join()

    def request(self,path='/transcribe',data=None,auth=True,kind='audio/wav'):
        headers={'Content-Type':kind}
        if auth:headers['Authorization']='Bearer synthetic-test-token'
        req=urllib.request.Request(f'http://127.0.0.1:{self.server.server_port}{path}',data=data,headers=headers)
        try:return urllib.request.urlopen(req,timeout=3)
        except urllib.error.HTTPError as error:return error

    def test_auth_before_processing(self):
        count=len(self.calls)
        self.assertEqual(self.request(data=self.audio,auth=False).status,401)
        self.assertEqual(len(self.calls),count)

    def test_health(self):
        self.assertEqual(self.request('/health').status,200)
        self.assertEqual(self.request('/health',auth=False).status,401)

    def test_valid_returns_only_text(self):
        response=self.request(data=self.audio)
        self.assertEqual(response.status,200)
        self.assertEqual(response.headers['Cache-Control'],'no-store')
        self.assertIn('جلسه',response.read().decode())

    def test_bounds_and_format(self):
        self.assertEqual(self.request(data=b'bad').status,413)
        self.assertEqual(self.request(data=self.audio,kind='application/json').status,415)
        self.assertEqual(self.request(data=b'x'*4000).status,422)

    def test_busy_does_not_queue_inference(self):
        self.server.inference.acquire()
        try:self.assertEqual(self.request(data=self.audio).status,429)
        finally:self.server.inference.release()

    def test_pcm_integrity(self):
        self.assertEqual(len(speech.pcm_samples(self.audio)),3200)
        with self.assertRaises(ValueError):speech.pcm_samples(self.audio[:-10])

if __name__=='__main__':unittest.main()
