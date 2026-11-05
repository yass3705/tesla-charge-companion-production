#!/usr/bin/env python3
"""Adapt join-ledger transport in a NEW candidate, preserving all source shards."""
import argparse
import gzip
import json
import shutil
import tempfile
from pathlib import Path

from package_v9_preproduction_map import ROOT, check_candidate, copy_preview_file, digest


def build(candidate: Path, destination: Path) -> dict:
    candidate, destination = candidate.resolve(), destination.resolve()
    if (destination.exists() or destination == ROOT or ROOT in destination.parents or
            candidate == destination or candidate in destination.parents):
        raise ValueError("New output outside checkout and input required")
    index = check_candidate(candidate)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="v9-join-transport-", dir=destination.parent) as temp:
        stage = Path(temp) / "prepared"
        shutil.copytree(candidate, stage, copy_function=copy_preview_file)
        changed = False
        for entry in index.get("joins", []):
            if entry.get("encoding") == "gzip":
                continue
            path = stage / entry["path"]
            raw = path.read_bytes()
            if digest(raw) != entry["sha256"]:
                raise ValueError("Exact join source SHA mismatch")
            payload = gzip.compress(raw, mtime=0)
            relative = entry["path"] + ".bin"
            (stage / relative).write_bytes(payload)
            entry.update(path=relative, encoding="gzip", bytes=len(payload),
                         uncompressedBytes=len(raw), uncompressedSha256=entry["sha256"],
                         sha256=digest(payload))
            path.unlink()  # Only the new copy; the complete original stays in candidate.
            changed = True
        if changed:
            (stage / "index.json").write_text(json.dumps(index, sort_keys=True) + "\n")
        check_candidate(stage)
        stage.rename(destination)
    return {"status": "validated_transport_only", "bundleId": index["bundleId"],
            "sourcesUnchanged": True, "joins": index.get("joins", [])}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--prepared", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(build(args.prepared, args.out)))
