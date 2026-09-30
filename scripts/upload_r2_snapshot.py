#!/usr/bin/env python3
import argparse
import pathlib
import subprocess

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--root",required=True)
    ap.add_argument("--snapshot-id",required=True)
    ap.add_argument("--bucket",required=True)
    ap.add_argument("--dry-run",action="store_true")
    a=ap.parse_args()

    root=pathlib.Path(a.root)
    files=sorted(p for p in root.rglob("*") if p.is_file())
    if not files:
        raise SystemExit("snapshot is empty")

    total_bytes=sum(p.stat().st_size for p in files)
    max_file=max(files,key=lambda p:p.stat().st_size)
    print({
      "snapshotId":a.snapshot_id,
      "objects":len(files),
      "bytes":total_bytes,
      "largestObject":str(max_file.relative_to(root)),
      "largestObjectBytes":max_file.stat().st_size,
      "dryRun":a.dry_run
    })

    for i,p in enumerate(files,1):
        rel=p.relative_to(root).as_posix()
        key=f"snapshots/{a.snapshot_id}/{rel}"
        if a.dry_run:
            if i <= 5 or i == len(files):
                print(f"PLAN {key} <- {p} ({p.stat().st_size} bytes)")
            continue
        subprocess.run([
          "npx","wrangler","r2","object","put",f"{a.bucket}/{key}",
          "--file",str(p),"--remote"
        ],check=True)
        if i % 100 == 0 or i == len(files):
            print(f"uploaded {i}/{len(files)}")

if __name__=="__main__":
    main()
