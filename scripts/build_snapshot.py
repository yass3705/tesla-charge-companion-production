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
    ap.add_argument("--germany-source")
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

    # Snapshot-specific canonical inputs newer/more authoritative than legacy runtime.
    overlays=out/"snapshot-inputs"
    pairs=[
      (dl/"data/national/switzerland_public_charging_v9.json", overlays/"CH/switzerland_public_charging_v9.json"),
      (dl/"data/national/france_public_charging_canonical.json", overlays/"FR/france_public_charging_canonical.json"),
      (dl/"inventory/united_kingdom.json", overlays/"UK/inventory.json"),
    ]
    for src,dst in pairs:
        if src.exists(): copy_file(src,dst)

    # UK validated national feeds.
    national=dl/"data/national"
    uk_dst=overlays/"UK/national"
    uk_dst.mkdir(parents=True,exist_ok=True)
    for p in national.glob("uk_*"):
        if p.is_file(): copy_file(p,uk_dst/p.name)
    for name in ("fastned_direct_stations_uk.json.gz","ionity_direct_stations_uk.json.gz"):
        p=national/name
        if p.exists(): copy_file(p,uk_dst/name)

    # Morocco CPO-consolidated evidence/overlays.
    ma=dl/"reports/morocco"
    if ma.exists(): copy_tree(ma,overlays/"MA/reports")

    # Italy direct validated overlays beside the compiled baseline.
    it_dst=overlays/"IT/direct"
    it_dst.mkdir(parents=True,exist_ok=True)
    for p in national.glob("*italy*"):
        if p.is_file(): copy_file(p,it_dst/p.name)

    # Germany national BNetzA/AFIR baseline + current resolution ledger.
    if a.germany_source:
        de_src=pathlib.Path(a.germany_source)
        catalog=de_src/"germany_non_tesla_catalog_staging_direct_cpo.json.gz"
        manifest=de_src/"germany_non_tesla_catalog_staging_direct_cpo_manifest.json"
        assert catalog.exists() and manifest.exists(), "Germany source artifact incomplete"
        de_dst=overlays/"DE"
        copy_file(catalog,de_dst/"all.json.gz")
        copy_file(manifest,de_dst/"national-base-manifest.json")
        prod_ledger=pathlib.Path("docs/source-ledgers/germany-cpo-second-pass-resolution-180.json")
        copy_file(prod_ledger,de_dst/"resolution-ledger.json")
        with manifest.open() as f: m=json.load(f)
        assert m["stats"]["nonTeslaSites"] == 63405
        assert m["stats"]["directCpoSites"] == 5471

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
      "bytes":sum(x["bytes"] for x in files),
      "files":files
    }
    (out/"manifest.json").write_text(json.dumps(manifest,indent=2)+"\n")
    print(json.dumps({"snapshotId":cfg["snapshotId"],"fileCount":len(files),"bytes":manifest["bytes"]}))

if __name__=="__main__":
    main()
