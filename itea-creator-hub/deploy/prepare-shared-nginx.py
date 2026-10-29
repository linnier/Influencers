#!/usr/bin/env python3
"""Add only the /creators/ mount to existing HTTPS servers; never reload Nginx."""
import argparse
from datetime import datetime, timezone
from pathlib import Path
import re
import shutil
import subprocess

LOCATION = '''# itea creator application; original portal routes stay in their own locations.
location = /creators { return 308 /creators/; }
location ^~ /creators/ {
    auth_request off;
    auth_basic off;
    proxy_pass http://127.0.0.1:8796;
    proxy_set_header Host $http_host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_read_timeout 120s;
    client_max_body_size 20m;
}
'''
TOKEN = re.compile(r'''\#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\\.|[{};]|[^\s{};\#"']+''')

def add_mount(source, include):
    tokens = [(m.group(), m.start()) for m in TOKEN.finditer(source) if not m.group().startswith('#')]
    stack, positions = [], []
    for i, (token, position) in enumerate(tokens):
        if token == '{':
            stack.append((i > 0 and tokens[i-1][0] == 'server', position))
        elif token == '}':
            if not stack:
                raise ValueError('Unbalanced Nginx configuration')
            server, start = stack.pop()
            if server:
                body = source[start:position]
                if re.search(r'^\s*listen\s+(?:[^;\s]+:)?443(?:\s|;)', body, re.M):
                    directive = 'include ' + str(include) + ';'
                    if directive in body:
                        continue
                    if re.search(r'\blocation\s+[^;\n]*?/creators(?:/|\s|\{)', body):
                        raise ValueError('Existing /creators location: inspect it before changing')
                    positions.append(position)
    if stack:
        raise ValueError('Unbalanced Nginx configuration')
    if not positions and 'include ' + str(include) + ';' not in source:
        raise ValueError('No HTTPS server listening on 443 found; no changes made')
    for position in reversed(positions):
        source = source[:position] + '    include ' + str(include) + ';\n' + source[position:]
    return source, len(positions)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--site', default='/etc/nginx/sites-enabled/itea-new-store-pmo')
    args = parser.parse_args()
    site = Path(args.site).resolve(strict=True)
    include = Path('/etc/nginx/itea-creator-location.conf')
    original = site.read_text()
    updated, count = add_mount(original, include)
    if include.exists() and include.read_text() != LOCATION:
        raise SystemExit('STOP: include file already exists with different content; unchanged')
    check = subprocess.run(['nginx', '-t'], capture_output=True, text=True)
    if check.returncode:
        raise SystemExit('STOP: existing Nginx configuration fails its check; unchanged\n' + check.stderr)
    folder = Path('/root/itea-nginx-backups')
    folder.mkdir(mode=0o700, exist_ok=True)
    backup = folder / (site.name + '.' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
    shutil.copy2(site, backup)
    created = not include.exists()
    try:
        if created:
            with include.open('x') as f:
                f.write(LOCATION)
        site.write_text(updated)
        check = subprocess.run(['nginx', '-t'], capture_output=True, text=True)
        if check.returncode:
            raise RuntimeError(check.stderr)
    except Exception:
        shutil.copy2(backup, site)
        if created:
            include.unlink(missing_ok=True)
        raise
    print('OK: /creators/ configured in', count, 'HTTPS server block(s).')
    print('Backup:', backup)
    print('Nginx syntax check passed. Nginx has NOT been reloaded.')

if __name__ == '__main__':
    main()
