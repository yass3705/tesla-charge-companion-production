#!/usr/bin/env python3
"""Check an isolated V9 package against static Pages asset limits; never deploy."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from package_v9_preproduction_map import check_candidate, digest


MAX_FILES = 20_000
MAX_ASSET_BYTES = 25 * 1024 * 1024


def check(site: Path) -> dict:
    site = site.resolve()
    config = json.loads((site / "v9-production-shell/shell-config.json").read_bytes())
    index_path = site / "prepared-v9/index.json"
    index = check_candidate(index_path.parent)
    if (config.get("preproductionIsolated") is not True or config.get("fallback") != "fail-closed" or
            config.get("preparedBundleId") != index["bundleId"] or
            config.get("preparedIndexSha256") != digest(index_path.read_bytes())):
        raise ValueError("Preview configuration or pinned candidate mismatch")
    runtime = Path(config.get("runtimeBase") or "")
    tesla_path = site / runtime / "data/tesla_stations.json"
    if (not runtime.parts or runtime.is_absolute() or ".." in runtime.parts or
            not tesla_path.is_file() or
            config.get("teslaArtifactSha256") != digest(tesla_path.read_bytes())):
        raise ValueError("Preview Tesla inventory SHA mismatch")
    if ('url=./v9-production-shell/' not in (site / "index.html").read_text() or
            'const CONTROL_FALLBACK=null;' not in (site / "v9-production-shell/index.html").read_text() or
            'X-Robots-Tag: noindex' not in (site / "_headers").read_text() or
            'Disallow: /' not in (site / "robots.txt").read_text()):
        raise ValueError("Preview entry or noindex controls missing")
    if ((site / "snapshot-inputs").exists() or
            list((site / runtime / "data/v9").glob("*-offers.json"))):
        raise ValueError("Historical build inputs or offers leaked into preview")
    files = [path for path in site.rglob("*") if path.is_file()]
    if any(path.is_symlink() for path in site.rglob("*")):
        raise ValueError("Preview symlink forbidden")
    if len(files) > MAX_FILES:
        raise ValueError("Preview exceeds static file limit")
    largest = max(files, key=lambda path: path.stat().st_size)
    if largest.stat().st_size > MAX_ASSET_BYTES:
        raise ValueError(f"Preview asset too large: {largest.relative_to(site)}")
    return {"status": "hosting_ready_local_only", "bundleId": index["bundleId"],
            "sourceCount": len(index["sources"]), "fileCount": len(files),
            "bytes": sum(path.stat().st_size for path in files),
            "largestAsset": largest.relative_to(site).as_posix(),
            "largestBytes": largest.stat().st_size, "deployed": False}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--site", required=True, type=Path)
    args = parser.parse_args()
    print(json.dumps(check(args.site), ensure_ascii=False))
