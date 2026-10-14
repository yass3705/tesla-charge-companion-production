#!/usr/bin/env python3
"""Read-only dependency/provenance audit for the V9 four-repository transition."""
import argparse, hashlib, json, pathlib
from datetime import datetime, timezone

p=argparse.ArgumentParser()
p.add_argument("--stable",type=pathlib.Path,required=True)
p.add_argument("--datalab",type=pathlib.Path,required=True)
p.add_argument("--production",type=pathlib.Path,required=True)
p.add_argument("--report",type=pathlib.Path,required=True)
a=p.parse_args()
checks=[]
def check(label,path):
    checks.append({"name":label,"path":str(path),"exists":path.exists(),
                   "sha256":hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None})
    return path
fr=check("Data Lab canonical France manifest",a.datalab/"data/national/france-irve-static-v9/manifest.json")
st=check("Stable France runtime mirror",a.stable/"v9-production-runtime/data/v9/france-static/manifest.json")
check("Production refresh policy",a.production/"config/refresh-policy.json")
check("Production snapshot build",a.production/"scripts/build_snapshot.py")
if fr.exists() and st.exists():
    source=json.loads(fr.read_text()); mirror=json.loads(st.read_text())
    identical_keys=["stationCount","pdcCount","sourceSha256","allSha256"]
    comparison={key:{"datalab":source.get(key),"stable":mirror.get(key),
                     "equal":source.get(key)==mirror.get(key)} for key in identical_keys}
else: comparison={}
policy=a.production/"config/refresh-policy.json"
selection=json.loads(policy.read_text()) if policy.exists() else {}
report={"generatedAt":datetime.now(timezone.utc).isoformat(),"purpose":"shadow-audit-no-publish",
        "franceManifestComparison":comparison,"inputs":checks,
        "productionDevelopmentPin":selection.get("development",{}),
        "cutoverAuthorized":False,
        "requiredNext":["validate production build independent from mutable Stable France mirror",
                        "compare EVSE and power counts on same immutable source SHA",
                        "run parallel preview and runtime tests",
                        "verify URL/PWA rollback before disabling Stable Pages",
                        "retain Updater Test Tesla Mac self-hosted runner"]}
a.report.parent.mkdir(parents=True,exist_ok=True)
a.report.write_text(json.dumps(report,indent=2,ensure_ascii=False,default=str)+"\n")
print(json.dumps({"manifestComparison":comparison,"cutoverAuthorized":False},indent=2))
