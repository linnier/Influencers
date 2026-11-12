"""Rebuild the unpacked Chrome/Edge helper archive without external packages."""
from pathlib import Path
import zipfile
import json
import re
root = Path(__file__).resolve().parent.parent
source = root / 'tools/creator-profile-helper'
target = root / 'itea-creator-hub/public/discovery-helper.zip'
# Keep the website download label aligned with the packaged manifest.
version = json.loads((source / 'manifest.json').read_text())['version']
ui = root / 'itea-creator-hub/public/creator-discovery.js'
text = ui.read_text()
updated, count = re.subn(r"const HELPER_VERSION='[0-9]+\.[0-9]+\.[0-9]+';", f"const HELPER_VERSION='{version}';", text)
if count != 1:
    raise ValueError('Expected one helper version declaration in download UI')
if updated != text:
    ui.write_text(updated)
with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
    for name in ['README.txt', 'manifest.json', 'popup.css', 'popup.html', 'popup.js', 'profile-card.js', 'wordmark.png', 'batch.html', 'batch.css', 'batch.js', 'batch-core.js', 'work-tabs.js', 'scan-page.js', 'follower-count.js', 'site-sync.js', 'scan-history.js']:
        path = source / name
        if path.is_file():
            item = zipfile.ZipInfo(path.name, date_time=(2026, 11, 9, 0, 0, 0))
            item.compress_type = zipfile.ZIP_DEFLATED
            item.external_attr = 0o100644 << 16
            archive.writestr(item, path.read_bytes())
print(target)
