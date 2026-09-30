#!/usr/bin/env python3
"""Verify every file in a previously built immutable V9 candidate artifact."""
import hashlib
import json
import pathlib
import sys

def main(root):
    root=root.resolve()
    manifest=json.loads((root/"manifest.json").read_text(encoding="utf-8"))
    assert manifest["snapshotId"]=="2026-09-30-r8", manifest.get("snapshotId")
    assert manifest["policy"]=="fail-closed"
    rows=manifest["files"]
    assert manifest["fileCount"]==len(rows)>=1500
    assert len({r["path"] for r in rows})==len(rows), "duplicate manifest paths"
    assert manifest["bytes"]==sum(r["bytes"] for r in rows)
    for row in rows:
        p=(root/row["path"]).resolve()
        assert p.is_relative_to(root) and p.is_file(), "unsafe/missing file: "+row["path"]
        assert p.stat().st_size==row["bytes"], "size mismatch: "+row["path"]
        h=hashlib.sha256()
        with p.open("rb") as f:
            for chunk in iter(lambda:f.read(1024*1024),b""):
                h.update(chunk)
        assert h.hexdigest()==row["sha256"], "checksum mismatch: "+row["path"]
    actual={p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file()}
    assert actual=={r["path"] for r in rows}|{"manifest.json"}, "unmanifested or missing files"
    print(json.dumps({"ok":True,"snapshotId":manifest["snapshotId"],"fileCount":len(rows),"bytes":manifest["bytes"],"allSha256Verified":True}))

if __name__=="__main__":
    main(pathlib.Path(sys.argv[1]))
