#!/usr/bin/env python3
import argparse
import pathlib
import subprocess

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--root",required=True)
    ap.add_argument("--snapshot-id",required=True)
    ap.add_argument("--bucket",required=True)
    a=ap.parse_args()
    root=pathlib.Path(a.root)
    files=sorted(p for p in root.rglob("*") if p.is_file())
    if not files:
        raise SystemExit("snapshot is empty")
    for i,p in enumerate(files,1):
        rel=p.relative_to(root).as_posix()
        key=f"snapshots/{a.snapshot_id}/{rel}"
        subprocess.run([
          "npx","wrangler","r2","object","put",f"{a.bucket}/{key}",
          "--file",str(p),"--remote"
        ],check=True)
        if i % 100 == 0 or i == len(files):
            print(f"uploaded {i}/{len(files)}")
if __name__=="__main__":
    main()
