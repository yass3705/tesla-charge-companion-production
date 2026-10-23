#!/usr/bin/env python3
"""Build an isolated read-only V9 data candidate from a prepared bundle."""
from __future__ import annotations

import argparse
import json
import tempfile
from pathlib import Path

from import_v9_bundle import import_source, sha256, verify
from build_v9_exact_join_report import compute as compute_exact_joins


ROOT = Path(__file__).resolve().parents[1]


def build(bundle: Path, destination: Path) -> dict:
    destination = destination.resolve()
    if destination == ROOT or ROOT in destination.parents:
        raise ValueError("Preproduction output must be outside Production checkout")
    if destination.exists():
        raise ValueError("Preproduction destination already exists")
    # Selected-source verification allows healthy sources to survive a corrupted
    # sibling. The manifest hash and exact file set are still checked each time.
    manifest = json.loads((bundle / "manifest.json").read_bytes())
    if not isinstance(manifest.get("sources"), list):
        raise ValueError("Prepared source list missing")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="v9-preview-", dir=destination.parent) as temporary:
        stage = Path(temporary)
        accepted, rejected = [], []
        for entry in manifest["sources"]:
            source = entry.get("source")
            try:
                # Verifies source SHA, manifest SHA, schema and exact relationships.
                verify(bundle, selected_source=source)
                path = import_source(bundle, source, stage / "sources")
                accepted.append({"source": source, "path": str(path.relative_to(stage)), "sha256": sha256(path.read_bytes())})
            except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
                rejected.append({"source": source, "reason": type(exc).__name__})
        if not accepted:
            raise ValueError("No validated source available for preproduction")
        index = {"schemaVersion": 1, "bundleId": bundle.name,
                 "status": "prepared" if not rejected else "partial_failure",
                 "sources": accepted, "rejected": rejected, "joins": []}
        (stage / "index.json").write_text(json.dumps(index, ensure_ascii=False, sort_keys=True, indent=2) + "\n")
        if "FR:irve_static" in {entry["source"] for entry in accepted}:
            report = compute_exact_joins(stage, "FR:irve_static")
            relative = Path("joins/FR__irve_static.json")
            path = stage / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            raw = (json.dumps(report, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode()
            path.write_bytes(raw)
            index["joins"].append({"nationalSource": "FR:irve_static", "path": relative.as_posix(),
                                   "sha256": sha256(raw), "status": "exact_identity_only"})
            (stage / "index.json").write_text(json.dumps(index, ensure_ascii=False, sort_keys=True, indent=2) + "\n")
        stage.rename(destination)
    return index


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bundle", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    print(json.dumps(build(args.bundle, args.out)))


if __name__ == "__main__":
    main()
