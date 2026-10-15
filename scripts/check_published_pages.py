#!/usr/bin/env python3
"""Read-only health check for the Production-owned published V9 snapshot."""

import argparse
import hashlib
import json
import re
import time
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen

BASE_URL = "https://yass3705.github.io/tesla-charge-companion-production/"
COUNTRIES = {"TESLA", "ES", "NL", "CH", "MA", "FR", "IT", "DE", "UK", "BE"}
CRITICAL = (
    "index.html",
    "service-worker.js",
    "manifest.webmanifest",
    "v9-production-shell/shell-config.json",
    "v9-production-shell/bridge.js",
    "runtime/assets/v9/runtime-engine.js",
    "runtime/data/v9/source-registry.json",
    "runtime/data/v9/switzerland-static/manifest.json",
)


def verify(manifest, expected_snapshot, read):
    if manifest.get("snapshotId") != expected_snapshot:
        raise ValueError("Published snapshot ID differs from Production's current pin")
    datasets = manifest.get("datasets") or []
    if {row.get("id") for row in datasets} != COUNTRIES:
        raise ValueError("Published country inventory differs from the ten-country contract")
    files = manifest.get("files") or []
    listed = {row.get("path"): row for row in files}
    if len(files) != manifest.get("fileCount") or len(listed) != len(files) or len(files) < 2000:
        raise ValueError("Published file inventory is incomplete or duplicated")
    for path in CRITICAL:
        entry = listed.get(path)
        if not entry or not re.fullmatch(r"[0-9a-f]{64}", str(entry.get("sha256", ""))):
            raise ValueError(f"Critical asset missing from manifest: {path}")
        body = read(path)
        if len(body) != entry["bytes"] or hashlib.sha256(body).hexdigest() != entry["sha256"]:
            raise ValueError(f"Published asset differs from manifest: {path}")
        if path == "v9-production-shell/shell-config.json":
            shell = json.loads(body)
            if shell.get("snapshotId") != expected_snapshot:
                raise ValueError("Published shell points to a different snapshot")
        if path == "index.html" and b"v9-production-shell/" not in body:
            raise ValueError("Published root no longer enters the V9 shell")
    return {"snapshotId": expected_snapshot, "fileCount": len(files), "checkedAssets": len(CRITICAL)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default=BASE_URL)
    parser.add_argument("--policy", type=Path, default=Path("config/refresh-policy.json"))
    args = parser.parse_args()
    policy = json.loads(args.policy.read_text(encoding="utf-8"))
    expected = policy["development"]["currentSnapshot"]
    base = args.base_url.rstrip("/") + "/"
    nonce = str(int(time.time()))

    def read(path):
        request = Request(base + quote(path) + "?monitorTs=" + nonce, headers={"Cache-Control": "no-cache"})
        with urlopen(request, timeout=30) as response:
            if response.status != 200:
                raise ValueError(f"HTTP {response.status}: {path}")
            return response.read()

    manifest = json.loads(read("manifest.json"))
    print(json.dumps(verify(manifest, expected, read), sort_keys=True))


if __name__ == "__main__":
    main()
