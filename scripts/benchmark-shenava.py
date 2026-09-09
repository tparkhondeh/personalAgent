"""Isolated public-data comparison. Never loads repository Python code."""
import os
os.environ['HF_HUB_DISABLE_IMPLICIT_TOKEN']='1'
os.environ['HF_HUB_DISABLE_TELEMETRY']='1'
os.environ['OMP_NUM_THREADS']='2'
import pathlib,json,time,resource,hashlib
from huggingface_hub import snapshot_download
from faster_whisper.audio import decode_audio
import sherpa_onnx
root=pathlib.Path(__file__).resolve().parent
name='Reza2kn/Shenava-Koochik-v1.0-sherpa-onnx'
revision='f063f38cb38fe02df39887ac65c441b755ab25a2'
directory=pathlib.Path(snapshot_download(name,revision=revision,local_dir=str(root/'models/shenava-koochik'),allow_patterns=['model.onnx','tokens.txt','LICENSE'],token=False,max_workers=2))
digest=hashlib.sha256((directory/'model.onnx').read_bytes()).hexdigest()
if digest!='6a564b5541920ce1c37bbc91d22e4b3a6838648b9b327eb88997e8db1f90950d':raise RuntimeError('Model bytes changed; review before use')
started=time.perf_counter()
recognizer=sherpa_onnx.OfflineRecognizer.from_nemo_ctc(model=str(directory/'model.onnx'),tokens=str(directory/'tokens.txt'),num_threads=2)
loading=time.perf_counter()-started
manifest=json.loads((root/'fixtures/manifest.json').read_text());results=[]
for item in manifest['samples']:
    path=root/'fixtures'/item['file']
    if hashlib.sha256(path.read_bytes()).hexdigest()!=item['sha256']:raise RuntimeError('Fixture digest changed')
    samples=decode_audio(str(path),sampling_rate=16000)
    started=time.perf_counter();stream=recognizer.create_stream();stream.accept_waveform(16000,samples);recognizer.decode_stream(stream)
    results.append(dict(id=item['id'],reference=item['text'],text=stream.result.text,seconds=time.perf_counter()-started,duration=len(samples)/16000))
    print('completed',item['id'],flush=True)
(root/'shenava-server.json').write_text(json.dumps(dict(model=name,revision=revision,sha256=digest,modelBytes=(directory/'model.onnx').stat().st_size,threads=2,loadSeconds=loading,normalization='metadata empty; no per-feature normalization; no ITN',peakRssKiB=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,results=results),ensure_ascii=False,indent=2))
print('Benchmark complete',flush=True)
