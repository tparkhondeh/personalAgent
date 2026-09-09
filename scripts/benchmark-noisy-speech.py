"""Same four PUBLIC clips, deterministic 15dB noise and inserted silent pauses."""
import pathlib,json,time,os
os.environ['OMP_NUM_THREADS']='2'
import numpy as np
import vosk
import sherpa_onnx
from faster_whisper.audio import decode_audio
root=pathlib.Path(__file__).resolve().parent
manifest=json.loads((root/'fixtures/manifest.json').read_text())
vosk.SetLogLevel(-1)
model=vosk.Model(str(next((root/'models/vosk').glob('vosk-model*'))))
shenava=sherpa_onnx.OfflineRecognizer.from_nemo_ctc(model=str(root/'models/shenava-koochik/model.onnx'),tokens=str(root/'models/shenava-koochik/tokens.txt'),num_threads=2)
results=[]
for item in manifest['samples'][:4]:
    original=decode_audio(str(root/'fixtures'/item['file']),sampling_rate=16000)
    for condition in ['clean','noise15db','pauses']:
        values=original.copy()
        if condition=='noise15db':
            rng=np.random.default_rng(20260909)
            noise=rng.normal(0,np.sqrt(np.mean(values**2))/(10**(15/20)),len(values)).astype(np.float32)
            values=np.clip(values+noise,-1,1)
        if condition=='pauses':
            mid=len(values)//2
            values=np.concatenate([np.zeros(8000,np.float32),values[:mid],np.zeros(12000,np.float32),values[mid:],np.zeros(8000,np.float32)])
        start=time.perf_counter();recognizer=vosk.KaldiRecognizer(model,16000)
        recognizer.AcceptWaveform((values*32767).astype('<i2').tobytes())
        old=json.loads(recognizer.FinalResult())['text'];old_seconds=time.perf_counter()-start
        start=time.perf_counter();stream=shenava.create_stream();stream.accept_waveform(16000,values);shenava.decode_stream(stream)
        results.append(dict(id=item['id'],condition=condition,reference=item['text'],vosk=old,shenava=stream.result.text,voskSeconds=old_seconds,shenavaSeconds=time.perf_counter()-start))
        print(item['id'],condition,flush=True)
(root/'noise-comparison.json').write_text(json.dumps(dict(seed=20260909,note='Public read speech, simulated noise/pauses; not physical microphone or real room noise.',results=results),ensure_ascii=False,indent=2))
