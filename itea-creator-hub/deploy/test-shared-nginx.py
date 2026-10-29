from pathlib import Path
import importlib.util
p = Path(__file__).with_name('prepare-shared-nginx.py')
spec = importlib.util.spec_from_file_location('config', p)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
original = '''server {
 listen 80;
 location / { return 301 https://$host$request_uri; }
}
server {
 listen 443 ssl;
 # a comment with { and }
 server_name _;
 location /workbench/ { proxy_pass http://127.0.0.1:8792; }
 location /mile-art/ { proxy_pass http://127.0.0.1:8794; }
 location / { proxy_pass http://127.0.0.1:4173; }
 add_header X-Test "quoted } text";
}
server {\n listen [::]:443 ssl;\n server_name example.test;\n}
'''
include = Path('/etc/nginx/itea-creator-location.conf')
updated, count = m.add_mount(original, include)
assert count == 2
assert updated.replace('    include ' + str(include) + ';\n', '') == original
assert m.add_mount(updated, include) == (updated, 0)
for bad in ['server {\n listen 80;\n}', 'server {\n listen 443 ssl;\n location /creators/ { return 403; }\n}']:
    try:
        m.add_mount(bad, include)
    except ValueError:
        pass
    else:
        raise AssertionError('Expected rejection')
print('PASS Nginx include insertion: HTTP and original routes byte-preserved, HTTPS only, quoted braces/comments, idempotent, existing-path conflict rejection.')
