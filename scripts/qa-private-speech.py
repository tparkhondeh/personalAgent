"""Staging loopback smoke: existing public FLEURS fixture only, no owner audio."""
import pathlib,urllib.request,urllib.error,json,time,io,wave
from faster_whisper.audio import decode_audio
base=pathlib.Path('/home/wealthos_dev/.staging/personal-agent')
root=base/'qa/speech-20260909'
token=next(line.split('=',1)[1] for line in (base/'services/tia-speech/private.env').read_text().splitlines() if line.startswith('ASR_INTERNAL_TOKEN='))
headers={'Authorization':'Bearer '+token,'Content-Type':'audio/wav'}
health=urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:3020/health',headers=headers),timeout=5)
assert json.load(health)['ready'] is True
item=json.loads((root/'fixtures/manifest.json').read_text())['samples'][0]
samples=decode_audio(str(root/'fixtures'/item['file']),sampling_rate=16000)
output=io.BytesIO()
with wave.open(output,'wb') as wav:
    wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(16000);wav.writeframes((samples*32767).astype('<i2').tobytes())
started=time.perf_counter()
response=urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:3020/transcribe',data=output.getvalue(),headers=headers),timeout=30)
result=json.load(response)
assert response.status==200 and result['text'].strip()
assert result['text'].strip()==json.loads((root/'shenava-server.json').read_text())['results'][0]['text'].strip()
report={'healthy':True,'samePublicReferenceOutput':True,'sample':item['id'],'seconds':time.perf_counter()-started,'audioStored':False}
(root/'service-smoke.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
