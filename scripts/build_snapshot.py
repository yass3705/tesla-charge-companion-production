#!/usr/bin/env python3
import argparse
import hashlib
import json
import pathlib
import shutil

def sha256(path):
    h=hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda:f.read(1024*1024), b""):
            h.update(chunk)
    return h.hexdigest()

def copy_file(src,dst):
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src,dst)

def copy_tree(src,dst):
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src,dst)

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--stable",required=True)
    ap.add_argument("--datalab",required=True)
    ap.add_argument("--out",required=True)
    ap.add_argument("--config",default="config/snapshots/2026-09-30.json")
    a=ap.parse_args()
    stable=pathlib.Path(a.stable)
    dl=pathlib.Path(a.datalab)
    out=pathlib.Path(a.out)
    cfg=json.loads(pathlib.Path(a.config).read_text())
    if out.exists(): shutil.rmtree(out)
    out.mkdir(parents=True)

    # Start from the already validated V9 runtime baseline.
    copy_tree(stable/"v9-production-runtime", out/"runtime")

    # Pin latest canonical inputs that are newer/more authoritative than the legacy runtime.
    overlays=out/"snapshot-inputs"
    pairs=[
      (dl/"data/national/switzerland_public_charging_v9.json", overlays/"CH/switzerland_public_charging_v9.json"),
      (dl/"data/national/france_public_charging_canonical.json", overlays/"FR/france_public_charging_canonical.json"),
      (dl/"inventory/united_kingdom.json", overlays/"UK/inventory.json"),
    ]
    for src,dst in pairs:
        if src.exists(): copy_file(src,dst)

    # UK validated national feeds.
    uk_src=dl/"data/national"
    uk_dst=overlays/"UK/national"
    uk_dst.mkdir(parents=True,exist_ok=True)
    for p in uk_src.glob("uk_*"):
        if p.is_file(): copy_file(p,uk_dst/p.name)
    for name in ("fastned_direct_stations_uk.json.gz","ionity_direct_stations_uk.json.gz"):
        p=uk_src/name
        if p.exists(): copy_file(p,uk_dst/name)

    # Morocco remains CPO-consolidated: preserve the current validated evidence/overlays.
    ma=dl/"reports/morocco"
    if ma.exists(): copy_tree(ma,overlays/"MA/reports")

    # Italy direct validated overlays from Data Lab are retained beside the stable compiled baseline.
    it_dst=overlays/"IT/direct"
    it_dst.mkdir(parents=True,exist_ok=True)
    for p in uk_src.glob("*italy*"):
        if p.is_file(): copy_file(p,it_dst/p.name)

    files=[]
    for p in out.rglob("*"):
        if p.is_file():
            files.append({"path":str(p.relative_to(out)),"bytes":p.stat().st_size,"sha256":sha256(p)})
    manifest={
      "schemaVersion":1,
      "snapshotId":cfg["snapshotId"],
      "policy":cfg["policy"],
      "sources":cfg["sources"],
      "datasets":cfg["datasets"],
      "fileCount":len(files),
      "files":files
    }
    (out/"manifest.json").write_text(json.dumps(manifest,indent=2)+"\n")
    print(json.dumps({"snapshotId":cfg["snapshotId"],"fileCount":len(files),"bytes":sum(x["bytes"] for x in files)}))

if __name__=="__main__":
    main()
