#!/usr/bin/env python3
"""Extend a signed spatial preview with one verified immutable source.

Unchanged fragments are APFS-cloned, never rewritten. Both source indexes and
the destination are checked before the new candidate becomes visible.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
import tempfile
from pathlib import Path

from package_v9_preproduction_map import check_candidate, copy_preview_file
from import_v9_bundle import verify
from shard_v9_preproduction_data import encoded
from build_v9_exact_join_report import compute as compute_exact_joins


def build(previous: Path, bundle: Path, addition: Path, destination: Path) -> dict:
    previous, bundle, addition, destination = [p.resolve() for p in (previous, bundle, addition, destination)]
    root = Path(__file__).resolve().parents[1]
    if (destination.exists() or destination == root or root in destination.parents or
            destination in (previous, bundle, addition) or
            any(p in destination.parents for p in (previous, bundle, addition))):
        raise ValueError("Extended candidate destination invalid")
    prior = check_candidate(previous)
    added = check_candidate(addition)
    manifest = verify(bundle)
    if (prior["schemaVersion"] != 2 or added["schemaVersion"] != 2 or
            prior["status"] != "prepared" or added["status"] != "prepared" or
            len(added["sources"]) != 1 or not isinstance(manifest.get("sources"), list)):
        raise ValueError("Only complete signed spatial candidates can be extended")
    new = added["sources"][0]
    prior_rows = {row["source"]: row for row in prior["sources"]}
    manifest_rows = {row["source"]: row for row in manifest["sources"]}
    if (new["source"] in prior_rows or set(manifest_rows) != set(prior_rows) | {new["source"]} or
            any(row["sourceSha256"] != manifest_rows[source]["sha256"] or
                row["sourceArtifactSha256"] != manifest_rows[source]["sourceArtifactSha256"]
                for source, row in prior_rows.items()) or
            new["sourceSha256"] != manifest_rows[new["source"]]["sha256"] or
            new["sourceArtifactSha256"] != manifest_rows[new["source"]]["sourceArtifactSha256"]):
        raise ValueError("Extended candidate source SHA or identity mismatch")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="v9-spatial-extension-", dir=destination.parent) as temporary:
        stage = Path(temporary) / "candidate"
        shutil.copytree(previous, stage, copy_function=copy_preview_file)
        for shard in new["shards"]:
            source = addition / shard["path"]
            target = stage / shard["path"]
            target.parent.mkdir(parents=True, exist_ok=True)
            if target.exists():
                raise ValueError("Extended shard path collision")
            copy_preview_file(str(source), str(target))
        index = dict(prior)
        index["bundleId"] = bundle.name
        index["sources"] = sorted([*prior["sources"], new], key=lambda row: row["source"])
        affected_country = new["source"].split(":", 1)[0]
        for join in index.get("joins", []):
            if join["nationalSource"].split(":", 1)[0] != affected_country:
                continue
            sparse = Path(temporary) / "sparse-prepared"
            sources = []
            for source, entry in sorted(manifest_rows.items()):
                if not source.startswith(affected_country + ":"):
                    continue
                relative = Path("sources") / entry["path"]
                target = sparse / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                copy_preview_file(str(bundle / entry["path"]), str(target))
                sources.append({"source": source, "path": relative.as_posix(),
                                "sha256": entry["sha256"]})
            (sparse / "index.json").write_bytes(encoded({"schemaVersion": 1,
                "bundleId": bundle.name, "status": "prepared", "sources": sources,
                "rejected": [], "joins": []}))
            report = compute_exact_joins(sparse, join["nationalSource"])
            raw = encoded(report)
            (stage / join["path"]).write_bytes(raw)
            join["sha256"] = hashlib.sha256(raw).hexdigest()
        (stage / "index.json").write_bytes(encoded(index))
        checked = check_candidate(stage)
        if (checked["bundleId"] != bundle.name or checked["status"] != "prepared" or
                len(checked["sources"]) != len(index["sources"])):
            raise ValueError("Extended candidate failed final check")
        stage.rename(destination)
    return {"status": "prepared", "bundleId": bundle.name,
            "sourceCount": len(index["sources"]), "addedSource": new["source"],
            "shardCount": sum(len(row["shards"]) for row in index["sources"])}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--previous", required=True, type=Path)
    parser.add_argument("--bundle", required=True, type=Path)
    parser.add_argument("--addition", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    print(json.dumps(build(args.previous, args.bundle, args.addition, args.out)))
