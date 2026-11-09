"""Rebuild the unpacked Chrome/Edge helper archive without external packages."""
from pathlib import Path
import zipfile
root = Path(__file__).resolve().parent.parent
source = root / 'tools/creator-profile-helper'
target = root / 'itea-creator-hub/public/discovery-helper.zip'
with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
    for name in ['README.txt', 'manifest.json', 'popup.css', 'popup.html', 'popup.js', 'profile-card.js', 'wordmark.png']:
        path = source / name
        if path.is_file():
            item = zipfile.ZipInfo(path.name, date_time=(2026, 11, 9, 0, 0, 0))
            item.compress_type = zipfile.ZIP_DEFLATED
            item.external_attr = 0o100644 << 16
            archive.writestr(item, path.read_bytes())
print(target)
