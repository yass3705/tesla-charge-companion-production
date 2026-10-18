#!/usr/bin/env python3
"""Build a small CI-only browser fixture from the exact pinned Midhope bytes."""
import hashlib
import json
import shutil
import sys
from pathlib import Path

root=Path(__file__).resolve().parents[1]
out=Path(sys.argv[1]).resolve()
golden=json.loads((root/'tests/golden/v9-tariff-phase7-midhope-source-133.json').read_text())
source=root/'tests/fixtures/v9-tariff-phase7-midhope-source-133.json.gz'
assert hashlib.sha256(source.read_bytes()).hexdigest()==golden['sourceSha256']
assets=out/'runtime/assets/v9';assets.mkdir(parents=True,exist_ok=True)
for base in ('runtime-owned/assets/v9','runtime-overrides/assets/v9'):
    for file in (root/base).glob('*.js'):
        shutil.copy2(file,assets/file.name)
(assets/'adapters').mkdir(exist_ok=True)
shutil.copy2(root/'runtime-overrides/assets/v9/adapters/uk-open-feeds.js',assets/'adapters/uk-open-feeds.js')
target=out/golden['sourcePath'];target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target)
(out/'manifest.json').write_text(json.dumps({'snapshotId':golden['snapshotId'],
    'files':[{'path':golden['sourcePath'],'sha256':golden['sourceSha256']}]},indent=2)+'\n')
print(json.dumps({'fixture':'four exact Midhope source offers, no catalogue','sourceSha256':golden['sourceSha256']}))
