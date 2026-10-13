"""Container + HTTPS + authentication + real-data-copy verification; no business mutations."""
from base64 import b64encode
import builtins
import getpass
import json
import os
from pathlib import Path
import re
import runpy
import secrets
import shutil
import socket
import sqlite3
import ssl
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
IMAGE = os.environ.get('INFLUENCERS_TEST_IMAGE', 'influencers-app:deployment-test')
COMPOSE_PATH = ROOT / os.environ.get('INFLUENCERS_TEST_COMPOSE', 'compose.yaml')
LAN_MODE = COMPOSE_PATH.name == 'compose.windows.yaml'
def command(args, **kwargs):
    result = subprocess.run(args, text=True, capture_output=True, **kwargs)
    if result.returncode:
        message = re.sub(r'\${1,2}2[aby]\${1,2}\d{2}\${1,2}[./A-Za-z0-9]{53}', '[REDACTED HASH]', result.stderr)
        raise RuntimeError(f'Command failed ({result.returncode}): {message[-2500:]}')
    return result

with tempfile.TemporaryDirectory(prefix='influencers-containers-', dir=os.environ.get('INFLUENCERS_TEST_TMP_DIR', str(ROOT.parent))) as directory:
    folder = Path(directory)
    (folder/'deploy').mkdir()
    for name in ['configure.py','restore-data.sh','backup.sh','Caddyfile']:
        shutil.copyfile(ROOT/'deploy'/name, folder/'deploy'/name)
    password = secrets.token_urlsafe(24)
    with patch.object(builtins,'input',side_effect=['creators.example.test','operator']), patch.object(getpass,'getpass',side_effect=[password,password]):
        runpy.run_path(str(folder/'deploy/configure.py'),run_name='__main__')
    env = folder/'.env.production'
    if LAN_MODE:
        with env.open('a') as handle:
            handle.write('LAN_IP=192.168.50.10\n')
    assert env.stat().st_mode & 0o777 == 0o600
    assert password not in env.read_text()
    original = json.loads(command(['docker','compose','-f',str(COMPOSE_PATH),'--env-file',str(env),'config','--format','json']).stdout)
    hashed = re.search(r"ADMIN_PASSWORD_HASH='([^']+)'",env.read_text()).group(1)
    # `compose config` escapes literal dollars for a round-trip compose file.
    assert original['services']['caddy']['environment']['ADMIN_PASSWORD_HASH'].replace('$$','$')==hashed
    assert not original['services']['app'].get('ports')
    assert original['networks']['private']['internal']
    assert original['services']['app']['cap_drop']==['ALL']
    if LAN_MODE:
        assert len(original['services']['caddy']['ports'])==1
        assert original['services']['caddy']['ports'][0]['host_ip']=='127.0.0.1'
        assert original['services']['caddy']['ports'][0]['target']==8443
    with socket.socket() as listener:
        listener.bind(('127.0.0.1',0))
        port=listener.getsockname()[1]
    project = 'influencers-test-'+secrets.token_hex(5)
    original['name']=project
    for group in ['volumes','networks']:
        for key, settings in original[group].items():
            settings['name']=project+'_'+key
    app=original['services']['app']
    app['image']=IMAGE
    app.pop('build',None)
    caddy=original['services']['caddy']
    if not LAN_MODE:
        caddy['environment']['SITE_DOMAIN']='localhost'
    caddy['ports']=[{'target':8443 if LAN_MODE else 443,'published':str(port),'host_ip':'127.0.0.1','protocol':'tcp'}]
    config=folder/'Caddyfile'
    config.write_text((ROOT/'deploy/Caddyfile.lan').read_text() if LAN_MODE else (ROOT/'deploy/Caddyfile').read_text().replace('{$SITE_DOMAIN} {','{$SITE_DOMAIN} {\n    tls internal'))
    config.chmod(0o644)
    for mount in caddy['volumes']:
        if mount['target']=='/etc/caddy/Caddyfile':
            mount['source']=str(config)
    (folder/'compose.yaml').write_text(json.dumps(original))
    (folder/'compose.yaml').chmod(0o600)
    compose=['docker','compose','--env-file',str(env),'-f',str(folder/'compose.yaml')]
    source=folder/'initial.sqlite'
    current=sqlite3.connect(f'file:{ROOT / "data/influencers.sqlite"}?mode=ro',uri=True)
    with sqlite3.connect(source) as copied:
        current.backup(copied)
        expected=copied.execute('select count(*) from influencers').fetchone()[0]
    current.close()
    source.chmod(0o600)
    try:
        command(['bash',str(folder/'deploy/restore-data.sh'),str(source)])
        print(f'PASS: restored independent test volume with {expected} records; credentials are hashed, not plaintext',flush=True)
        command(compose+['up','-d','--no-build'],timeout=120)
        certificate=folder/'local-root.crt'
        for _ in range(80):
            copied=subprocess.run(compose+['cp','caddy:/data/caddy/pki/authorities/local/root.crt',str(certificate)],capture_output=True)
            if copied.returncode==0:
                break
            time.sleep(.25)
        else:
            raise RuntimeError('Local test CA was not generated')
        context=ssl.create_default_context(cafile=str(certificate))
        origin=f'https://localhost:{port}'
        authorization='Basic '+b64encode(('operator:'+password).encode()).decode()
        def http(path, authenticated=False, method='GET', value=None, custom_auth=None):
            headers={'Origin':origin}
            if authenticated:
                headers['Authorization']=custom_auth or authorization
            if value is not None:
                headers['Content-Type']='application/json'
            request=urllib.request.Request(origin+path,headers=headers,method=method,data=json.dumps(value).encode() if value is not None else None)
            try:
                with urllib.request.urlopen(request,context=context,timeout=20) as response:
                    return response.status,response.read(),response.headers
            except urllib.error.HTTPError as error:
                return error.code,error.read(),error.headers
        for _ in range(60):
            try:
                if http('/api/health',True)[0]==200:
                    break
            except OSError:
                pass
            time.sleep(.5)
        else:
            raise RuntimeError('Authenticated HTTPS service did not become ready')
        for endpoint in ['/','/api/workspace','/api/health','/_next/static/does-not-exist.js']:
            assert http(endpoint)[0]==401
        assert http('/api/influencers',method='POST',value={})[0]==401
        wrong='Basic '+b64encode(b'operator:invalid-test-password').decode()
        assert http('/api/workspace',True,custom_auth=wrong)[0]==401
        status,page,headers=http('/',True)
        assert status==200 and 'itea达人库' in page.decode()
        if not LAN_MODE:
            assert headers['Strict-Transport-Security']=='max-age=31536000'
        assert headers['X-Content-Type-Options']=='nosniff'
        assets=re.findall(r'<script[^>]+src="([^\"]+)"',page.decode())
        assert assets
        for asset in assets:
            assert http(asset,True)[0]==200
        status,body,_=http('/api/workspace',True)
        assert status==200 and len(json.loads(body)['influencers'])==expected
        print('PASS: verified HTTPS certificate with a local trusted CA; pages/APIs/static routes reject unauthenticated access',flush=True)
        test_person={'name':'容器测试临时档案','handle':'container_check','platform':'Instagram','category':'生活方式','followers':1,'engagement':0,'quote':0,'status':'待联系'}
        status,created,_=http('/api/influencers',True,'POST',test_person)
        assert status==201
        identifier=json.loads(created)['id']
        assert http('/api/influencers/'+identifier,True,'DELETE')[0]==200
        command(compose+['restart','app'])
        for _ in range(60):
            status,body,_=http('/api/workspace',True)
            if status==200:
                assert len(json.loads(body)['influencers'])==expected
                break
            time.sleep(.25)
        else:
            raise RuntimeError('Restarted app not ready')
        command(['bash',str(folder/'deploy/backup.sh')])
        saved=list((folder/'backups').glob('*.sqlite'))
        assert len(saved)==1
        with sqlite3.connect(saved[0]) as db:
            assert db.execute('select count(*) from influencers').fetchone()[0]==expected
            assert db.execute('pragma integrity_check').fetchone()[0]=='ok'
        assert saved[0].stat().st_mode & 0o777 == 0o600
        attempt=subprocess.run(['bash',str(folder/'deploy/restore-data.sh'),str(source)],capture_output=True)
        assert attempt.returncode!=0
        command(compose+['stop','app'])
        attempt=subprocess.run(['bash',str(folder/'deploy/restore-data.sh'),str(source)],capture_output=True)
        assert attempt.returncode!=0
        print('PASS: authenticated create/delete, persistence after restart, verified online backup and refusal to overwrite existing data',flush=True)
    finally:
        # App logs never contain authentication credentials; redact hashes defensively.
        if __import__('sys').exc_info()[0] is not None:
            logs = subprocess.run(compose+['logs','--no-log-prefix','--tail','30','app','caddy'],capture_output=True,text=True)
            print(re.sub(r'\${1,2}2[aby]\${1,2}\d{2}\${1,2}[./A-Za-z0-9]{53}', '[REDACTED HASH]', logs.stdout),flush=True)
        subprocess.run(compose+['down','-v','--remove-orphans'],capture_output=True)
        # Only the uniquely named test volumes are removed; production volumes are untouched.
