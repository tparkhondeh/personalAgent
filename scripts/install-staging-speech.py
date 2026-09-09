"""Run as wealthos_dev on staging only, after reviewing the pinned local model.
Preserves old configuration and database; rollback instructions written beside backup.
No downloads, package installation, TLS/DNS/Production changes, or audio involved.
"""
import datetime
import hashlib
import os
import pathlib
import secrets
import shutil
import sqlite3
import subprocess

base=pathlib.Path('/home/wealthos_dev/.staging/personal-agent')
qa=base/'qa/speech-20260909'
if pathlib.Path.home()!=pathlib.Path('/home/wealthos_dev') or not (qa/'venv/bin/python').is_file():
    raise RuntimeError('Expected staging host and prepared isolated runtime')
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
backup=base/'data/backups'/('pre-local-asr-'+stamp)
backup.mkdir(mode=0o700)
shutil.copy2(base/'staging.env',backup/'staging.env')
with sqlite3.connect(f'file:{base}/data/hamrah-staging.db?mode=ro',uri=True) as source, sqlite3.connect(backup/'database.db') as target:
    source.backup(target)
    if target.execute('pragma integrity_check').fetchone()[0]!='ok':raise RuntimeError('Backup invalid')
service=base/'services/tia-speech'
service.mkdir(parents=True,exist_ok=True,mode=0o700)
if (service/'service.py').exists():shutil.copy2(service/'service.py',backup/'service.py')
shutil.copy2(pathlib.Path(__file__).with_name('tia-speech-service.py'),service/'service.py')
env_path=service/'private.env'
if env_path.exists():
    shutil.copy2(env_path,backup/'private.env')
    token=next(line.split('=',1)[1] for line in env_path.read_text().splitlines() if line.startswith('ASR_INTERNAL_TOKEN='))
else:
    token=secrets.token_hex(32)
    env_path.write_text('ASR_INTERNAL_TOKEN='+token+'\n')
    env_path.chmod(0o600)
env=(base/'staging.env').read_text()
lines=[line for line in env.splitlines() if not line.startswith(('ASR_INTERNAL_TOKEN=','ASR_SELF_HOSTED_ENABLED='))]
(base/'staging.env').write_text('\n'.join(lines)+'\nASR_SELF_HOSTED_ENABLED=true\nASR_INTERNAL_TOKEN='+token+'\n')
(base/'staging.env').chmod(0o600)
child=os.environ.copy()
child.update(ASR_INTERNAL_TOKEN=token,ASR_MODEL_DIR=str(qa/'models/shenava-koochik'),OMP_NUM_THREADS='2')
exists=subprocess.run(['pm2','describe','tia-staging-speech'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0
if exists:
    subprocess.run(['pm2','restart','tia-staging-speech','--update-env'],env=child,check=True,stdout=subprocess.DEVNULL)
else:
    subprocess.run(['pm2','start',str(service/'service.py'),'--name','tia-staging-speech','--interpreter',str(qa/'venv/bin/python'),'--max-memory-restart','1600M','--time'],env=child,check=True,stdout=subprocess.DEVNULL)
(backup/'ROLLBACK.txt').write_text('Stop only tia-staging-speech with pm2. Restore this staging.env to staging/staging.env and restart only personal-agent-staging with its existing launcher. Preserve current DB; do not restore the snapshot over new user data. No Production process or proxy was changed.\nPrevious release: '+str((base/'current').resolve())+'\n')
(backup/'SHA256.txt').write_text('\n'.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.name for p in backup.iterdir() if p.is_file())+'\n')
print('Staging-only speech installed; backup:',backup)
