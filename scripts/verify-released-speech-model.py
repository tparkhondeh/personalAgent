"""Cross-platform release check. Keep the stricter SAME-BUILD byte check too.
Linux/Windows tar/gzip metadata differ; compare every unpacked byte to pinned ZIP.
"""
import hashlib,io,json,pathlib,sys,tarfile,zipfile
apk=pathlib.Path(sys.argv[1])
source=pathlib.Path(sys.argv[2] if len(sys.argv)>2 else 'backups/local/speech-build/vosk-model-small-fa-0.42.zip')
assert hashlib.sha256(source.read_bytes()).hexdigest()=='977cb5faa538f3a835ccfd35f5f6d8284b5c450b89c700b9bd4736b66536ad46','Unreviewed upstream archive'
with zipfile.ZipFile(source) as archive:
    expected={entry.filename:hashlib.sha256(archive.read(entry)).hexdigest() for entry in archive.infolist() if not entry.is_dir()}
with zipfile.ZipFile(apk) as archive:
    model=archive.read('assets/public/speech/fa-0.42.model')
    engine=archive.read('assets/public/speech/vosk-0.0.8.js')
assert model[:2]==b'\x1f\x8b','Model must retain gzip bytes under .model extension'
actual={}
with tarfile.open(fileobj=io.BytesIO(model),mode='r:gz') as archive:
    for member in archive:
        if member.isdir():continue
        assert member.isfile() and member.name in expected,'Unexpected model member'
        assert member.name not in actual,'Duplicate model member'
        actual[member.name]=hashlib.sha256(archive.extractfile(member).read()).hexdigest()
assert actual==expected,'Decoded model bytes differ from pinned public source'
assert engine==pathlib.Path('public/speech/vosk-0.0.8.js').read_bytes(),'Patched browser engine mismatch'
print(json.dumps({'verified':True,'apkSha256':hashlib.sha256(apk.read_bytes()).hexdigest(),'gzipSha256':hashlib.sha256(model).hexdigest(),'modelFiles':len(actual),'allDecodedBytesMatchPinnedSource':True,'engineMatches':True}))
