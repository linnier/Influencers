"""Build a private code + consistent SQLite deployment archive, without credentials."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import tarfile
import tempfile
import zipfile

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--output', required=True, type=Path)
parser.add_argument('--database', type=Path, default=root / 'data/influencers.sqlite')
parser.add_argument('--windows', action='store_true', help='Create a Windows ZIP with UTF-8 BOM PowerShell scripts')
args = parser.parse_args()
if not args.database.is_file():
    raise SystemExit('Database not found; refusing to create an empty replacement')
allowed = ['README.md', 'AGENTS.md', 'package.json', 'package-lock.json', 'tsconfig.json',
           'next-env.d.ts', 'next.config.mjs', 'Dockerfile', '.dockerignore', '.gitignore',
           'compose.yaml', 'compose.windows.yaml', '.env.example', 'src', 'tests', 'deploy', 'scripts',
           'windows-start.cmd', 'windows-trust.cmd', 'windows-backup.cmd', 'windows-stop.cmd', 'start-personal.cmd']
args.output.parent.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory(prefix='influencers-package-') as temporary:
    snapshot = Path(temporary) / 'influencers.sqlite'
    original = sqlite3.connect(f'file:{args.database.resolve()}?mode=ro', uri=True)
    with sqlite3.connect(snapshot) as target:
        original.backup(target)
        if target.execute('PRAGMA integrity_check').fetchone()[0] != 'ok' or target.execute('PRAGMA foreign_key_check').fetchall():
            raise SystemExit('Source database failed validation')
        records = target.execute('SELECT count(*) FROM influencers').fetchone()[0]
    original.close()
    snapshot.chmod(0o600)
    manifest = Path(temporary) / 'manifest.json'
    manifest.write_text(json.dumps({'createdAt': datetime.now(timezone.utc).isoformat(), 'records': records,
                                   'databaseSHA256': hashlib.sha256(snapshot.read_bytes()).hexdigest()}, indent=2))
    descriptor = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, 'wb') as output:
            if args.windows:
                archive_context = zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6)
            else:
                archive_context = tarfile.open(fileobj=output, mode='w:gz')
            with archive_context as archive:
                def add_file(path, name):
                    if args.windows:
                        if path.is_dir():
                            return
                        content = path.read_bytes()
                        if path.suffix == '.ps1':
                            content = b'\xef\xbb\xbf' + content.decode('utf-8-sig').replace('\r\n','\n').replace('\n','\r\n').encode('utf-8')
                        elif path.suffix == '.cmd':
                            content = content.decode('ascii').replace('\r\n','\n').replace('\n','\r\n').encode('ascii')
                        archive.writestr(name, content)
                    else:
                        archive.add(path, arcname=name, recursive=False)
                for entry in allowed:
                    source = root / entry
                    if not source.exists():
                        raise RuntimeError(f'Missing deployment source: {entry}')
                    paths = [source] if source.is_file() else [source, *sorted(source.rglob('*'))]
                    for path in paths:
                        relative = path.relative_to(root)
                        if path.is_symlink():
                            raise RuntimeError(f'Refusing symlink: {relative}')
                        if '__pycache__' in path.parts or '_logs' in path.parts or path.suffix == '.pyc' or path.name == '_update-notifier-last-checked':
                            continue
                        if path.name.startswith('.env') and path.name != '.env.example':
                            raise RuntimeError('Credential file found in deployment sources')
                        add_file(path, (Path('Influencers') / relative).as_posix())
                add_file(snapshot, 'Influencers/initial-data/influencers.sqlite')
                add_file(manifest, 'Influencers/initial-data/manifest.json')
    except BaseException:
        args.output.unlink(missing_ok=True)
        raise
print(json.dumps({'archive': str(args.output.resolve()), 'records': records,
                  'archiveSHA256': hashlib.sha256(args.output.read_bytes()).hexdigest()}, ensure_ascii=False))
