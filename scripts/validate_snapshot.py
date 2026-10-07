#!/usr/bin/env python3
import json
import pathlib
import sys

EXPECTED = {"TESLA","ES","NL","CH","MA","FR","IT","DE","UK"}
ALLOWED = {"current","complete","complete-with-fail-closed-residuals","partial"}

def main():
    path = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "config/snapshots/2026-09-30.json")
    obj = json.loads(path.read_text())
    assert obj.get("schemaVersion") == 1
    assert obj.get("policy") == "fail-closed"
    datasets = obj.get("datasets", [])
    ids = [d.get("id") for d in datasets]
    assert len(ids) == len(set(ids)), "duplicate dataset ids"
    expected=EXPECTED|({"BE"} if str(obj.get("snapshotId") or "")[:10]>="2026-10-07" else set())
    assert set(ids) == expected, f"scope mismatch: {set(ids) ^ expected}"
    sources = obj.get("sources", {})
    for d in datasets:
        assert d.get("coverage") in ALLOWED, f"bad coverage for {d.get('id')}"
        src = d.get("primarySource")
        assert src in sources, f"unknown source {src}"
        sha = sources[src].get("sha","")
        assert len(sha) == 40 and all(c in "0123456789abcdef" for c in sha), f"unpinned source {src}"
        if not d.get("path"):
            assert d.get("materialization"), f"missing path/materialization for {d.get('id')}"
    print(f"OK snapshot={obj['snapshotId']} datasets={len(datasets)} policy={obj['policy']}")

if __name__ == "__main__":
    main()
