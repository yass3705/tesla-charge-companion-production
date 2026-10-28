#!/usr/bin/env python3
"""Read-only check of a separately hosted V9 preview against the local package."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

from check_v9_preview_hosting import check


ASSETS = (
    "index.html",
    "robots.txt",
    "v9-production-shell/index.html",
    "v9-production-shell/shell-config.json",
    "v9-production-shell/bridge.js",
    "prepared-v9/index.json",
)


def verify(site: Path, base_url: str, read, *, allow_local: bool = False) -> dict:
    parsed = urlparse(base_url)
    if parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ("", "/"):
        raise ValueError("Preview URL must be a bare origin")
    local = parsed.hostname in ("localhost", "127.0.0.1")
    if parsed.scheme != "https" and not (allow_local and local and parsed.scheme == "http"):
        raise ValueError("Preview must use HTTPS")
    if not parsed.hostname or parsed.hostname in ("teslachargecompanion.com", "www.teslachargecompanion.com", "yass3705.github.io"):
        raise ValueError("Public TCC origin cannot be used as preview")
    package = check(site)
    checked = []
    for path in ASSETS:
        expected = (site / path).read_bytes()
        body, headers = read(urljoin(base_url.rstrip("/") + "/", path))
        if hashlib.sha256(body).digest() != hashlib.sha256(expected).digest():
            raise ValueError(f"Remote asset SHA mismatch: {path}")
        if path == "index.html" and "noindex" not in headers.get("x-robots-tag", "").lower():
            raise ValueError("Remote preview noindex header missing")
        checked.append(path)
    index = json.loads((site / "prepared-v9/index.json").read_bytes())
    source = index["sources"][0]
    descriptor = source["shards"][0] if index["schemaVersion"] == 2 else source
    path = "prepared-v9/" + descriptor["path"]
    expected = (site / path).read_bytes()
    body, _ = read(urljoin(base_url.rstrip("/") + "/", path))
    if hashlib.sha256(body).digest() != hashlib.sha256(expected).digest():
        raise ValueError("Remote candidate fragment SHA mismatch")
    return {"status": "remote_static_verified", "bundleId": package["bundleId"],
            "checkedAssets": checked + [path], "browserVerified": False,
            "githubHandoffVerified": False}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--site", required=True, type=Path)
    parser.add_argument("--url", required=True)
    args = parser.parse_args()

    def read(url):
        with urlopen(Request(url, headers={"Cache-Control": "no-cache"}), timeout=30) as response:
            if response.status != 200:
                raise ValueError(f"Remote HTTP {response.status}")
            return response.read(), response.headers

    print(json.dumps(verify(args.site, args.url, read), sort_keys=True))


if __name__ == "__main__":
    main()
