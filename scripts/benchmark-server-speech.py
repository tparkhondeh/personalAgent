"""Public fixtures, isolated CPU benchmark; never an app endpoint or user audio."""
import os
os.environ['HF_HUB_DISABLE_IMPLICIT_TOKEN']='1'
os.environ['HF_HUB_DISABLE_TELEMETRY']='1'
os.environ['OMP_NUM_THREADS']='2'
import json, time, pathlib, hashlib, resource, tarfile
import numpy as np
from faster_whisper import WhisperModel
from faster_whisper.audio import decode_audio
from huggingface_hub import snapshot_download
from vosk import Model, KaldiRecognizer, SetLogLevel

root=pathlib.Path(__file__).resolve().parent
fixtures=root/'fixtures'
manifest=json.loads((fixtures/'manifest.json').read_text())
inputs=[]
for sample in manifest['samples']:
    file=fixtures/sample['file']
    if hashlib.sha256(file.read_bytes()).hexdigest()!=sample['sha256']: raise RuntimeError('Fixture digest mismatch')
    inputs.append((sample,decode_audio(str(file),sampling_rate=16000)))
models=root/'models'
models.mkdir(exist_ok=True)
vosk_dir=models/'vosk'
if not vosk_dir.exists():
    vosk_dir.mkdir()
    archive=pathlib.Path('/home/wealthos_dev/.staging/personal-agent/current/public/speech/fa-0.42.model')
    with tarfile.open(archive,'r:gz') as tar:
        for member in tar.getmembers():
            if not (vosk_dir/member.name).resolve().is_relative_to(vosk_dir.resolve()):raise RuntimeError('Unsafe model archive')
        tar.extractall(vosk_dir,filter='data')
vosk_path=next(p.parent for p in vosk_dir.rglob('am'))
SetLogLevel(-1)
started=time.perf_counter();vosk_model=Model(str(vosk_path));load=time.perf_counter()-started
results=[]
for item,audio in inputs:
    started=time.perf_counter();recognizer=KaldiRecognizer(vosk_model,16000);parts=[]
    samples=(np.clip(audio,-1,1)*32767).astype('<i2')
    for index in range(0,len(samples),16000):
        if recognizer.AcceptWaveform(samples[index:index+16000].tobytes()):parts.append(json.loads(recognizer.Result())['text'])
    parts.append(json.loads(recognizer.FinalResult())['text'])
    results.append(dict(id=item['id'],reference=item['text'],text=' '.join(parts).strip(),seconds=time.perf_counter()-started,duration=len(audio)/16000))
(root/'vosk-server.json').write_text(json.dumps(dict(model='vosk-small-fa-0.42',threads=2,loadSeconds=load,results=results,peakRssKiB=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss),ensure_ascii=False,indent=2))
del vosk_model
revision='536b0662742c02347bc0e980a01041f333bce120'
location=snapshot_download('Systran/faster-whisper-small',revision=revision,local_dir=str(models/'whisper-small'),allow_patterns=['model.bin','config.json','tokenizer.json','vocabulary.*','preprocessor_config.json'],token=False,max_workers=2)
started=time.perf_counter();model=WhisperModel(location,device='cpu',compute_type='int8',cpu_threads=2,num_workers=1,local_files_only=True);load=time.perf_counter()-started
results=[]
for item,audio in inputs:
    started=time.perf_counter();segments,_=model.transcribe(audio,language='fa',beam_size=5,temperature=0,condition_on_previous_text=False,vad_filter=True)
    text=' '.join(s.text.strip() for s in segments)
    results.append(dict(id=item['id'],reference=item['text'],text=text,seconds=time.perf_counter()-started,duration=len(audio)/16000))
    print('completed',item['id'],flush=True)
(root/'whisper-server.json').write_text(json.dumps(dict(model='Systran/faster-whisper-small',revision=revision,threads=2,precision='int8',beam=5,loadSeconds=load,results=results,peakRssKiB=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss),ensure_ascii=False,indent=2))
print('Benchmark complete',flush=True)
