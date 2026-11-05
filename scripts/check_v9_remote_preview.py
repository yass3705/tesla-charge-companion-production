#!/usr/bin/env python3
"""Read-only check of a separately hosted V9 preview against the local package."""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import sys
import time
import re
import threading
from http.client import IncompleteRead
from urllib.error import HTTPError, URLError
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


def verify(site: Path, base_url: str, read, *, allow_local: bool = False,
           all_fragments: bool = False, fragment_receipt: Path | None = None, workers: int = 2) -> dict:
    parsed = urlparse(base_url)
    if parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ("", "/"):
        raise ValueError("Preview URL must be a bare origin")
    local = parsed.hostname in ("localhost", "127.0.0.1")
    if parsed.scheme != "https" and not (allow_local and local and parsed.scheme == "http"):
        raise ValueError("Preview must use HTTPS")
    if not parsed.hostname or parsed.hostname in ("teslachargecompanion.com", "www.teslachargecompanion.com", "yass3705.github.io"):
        raise ValueError("Public TCC origin cannot be used as preview")
    package = check(site)
    if not 1 <= workers <= 8:
        raise ValueError("Remote concurrency must be between 1 and 8")
    verified_fragments = {}
    receipt_lock = threading.Lock()
    if fragment_receipt is not None:
        # Reuse is only legitimate on an immutable deployment URL, never a site alias.
        if not re.fullmatch(r"[a-f0-9]{24}--[a-z0-9-]+\.netlify\.app", parsed.hostname):
            raise ValueError("Fragment receipts require an immutable Netlify deploy URL")
        if site.resolve() in fragment_receipt.resolve().parents:
            raise ValueError("Receipt must remain outside the immutable package")
        header = {"schemaVersion": 1, "origin": base_url.rstrip("/"), "bundleId": package["bundleId"],
                  "indexSha256": hashlib.sha256((site / "prepared-v9/index.json").read_bytes()).hexdigest()}
        if fragment_receipt.exists():
            lines = fragment_receipt.read_text().splitlines()
            if not lines or json.loads(lines[0]) != header:
                raise ValueError("Fragment receipt provenance mismatch")
            for line in lines[1:]:
                row = json.loads(line)
                if set(row) != {"path", "sha256"} or not re.fullmatch(r"[a-f0-9]{64}", row["sha256"]):
                    raise ValueError("Invalid fragment receipt entry")
                verified_fragments[row["path"]] = row["sha256"]
        else:
            fragment_receipt.write_text(json.dumps(header) + "\n")
    reused_fragments = 0
    checked = []
    config=json.loads((site / "v9-production-shell/shell-config.json").read_bytes())
    additional=["runtime/assets/v9/data-engine.js", "runtime/assets/v9/preproduction-candidate-loader.js",
                "runtime/assets/v9/adapters/canonical-v9.js", "runtime/assets/v9/adapters/tesla-json.js",
                "runtime/assets/v9/pricing-engine.js", "runtime/assets/v9/session-engine.js",
                "runtime/assets/v9/charge-model-engine.js", "runtime/assets/v9/session-planner-engine.js",
                "runtime/data/tesla_stations.json", "data/exchange_rates.json",
                "runtime/assets/v9/offer-engine.js", "runtime/assets/v9/runtime-engine.js"]
    assets=list(ASSETS)+[path for path in additional if (site/path).is_file()]
    if config.get("nationalPolicySha256"):
        assets.append("v9-production-shell/national-catalogue-policy.json")
    for path in assets:
        expected = (site / path).read_bytes()
        body, headers = read(urljoin(base_url.rstrip("/") + "/", path))
        if hashlib.sha256(body).digest() != hashlib.sha256(expected).digest():
            raise ValueError(f"Remote asset SHA mismatch: {path}")
        if path == "index.html" and "noindex" not in headers.get("x-robots-tag", "").lower():
            raise ValueError("Remote preview noindex header missing")
        checked.append(path)
    index = json.loads((site / "prepared-v9/index.json").read_bytes())
    # The complete join ledger remains downloadable and signed, including its
    # uncompressed SHA checked locally by check(). Never omit it from receipt.
    for join in index.get("joins", []):
        join_path = "prepared-v9/" + join["path"]
        body, _ = read(urljoin(base_url.rstrip("/") + "/", join_path))
        if hashlib.sha256(body).hexdigest() != join["sha256"]:
            raise ValueError("Remote exact join SHA mismatch")
        checked.append(join_path)
    source = index["sources"][0]
    descriptor = source["shards"][0] if index["schemaVersion"] == 2 else source
    path = "prepared-v9/" + descriptor["path"]
    expected = (site / path).read_bytes()
    body, _ = read(urljoin(base_url.rstrip("/") + "/", path))
    if hashlib.sha256(body).digest() != hashlib.sha256(expected).digest():
        raise ValueError("Remote candidate fragment SHA mismatch")
    crosswalk = "runtime/data/v9/france-crosswalk.json"
    if (site / crosswalk).is_file():
        body, _ = read(urljoin(base_url.rstrip("/") + "/", crosswalk))
        if hashlib.sha256(body).digest() != hashlib.sha256((site / crosswalk).read_bytes()).digest():
            raise ValueError("Remote France crosswalk SHA mismatch")
        checked.append(crosswalk)
    fragment_count = 1
    if all_fragments:
        fragments = [("prepared-v9/" + shard["path"], shard["sha256"])
                     for row in index["sources"] for shard in row["shards"]]
        def check_fragment(entry):
            nonlocal reused_fragments
            fragment_path, sha = entry
            if verified_fragments.get(fragment_path) == sha:
                with receipt_lock:
                    reused_fragments += 1
                return
            body, _ = read(urljoin(base_url.rstrip("/") + "/", fragment_path))
            if hashlib.sha256(body).hexdigest() != sha:
                raise ValueError(f"Remote candidate fragment SHA mismatch: {fragment_path}")
            if fragment_receipt is not None:
                with receipt_lock, fragment_receipt.open("a") as stream:
                    stream.write(json.dumps({"path": fragment_path, "sha256": sha}) + "\n")
        with ThreadPoolExecutor(max_workers=workers) as pool:
            list(pool.map(check_fragment, fragments))
        fragment_count = len(fragments)
    return {"status": "remote_static_verified", "bundleId": package["bundleId"],
            "checkedAssets": checked + [path], "browserVerified": False,
            "githubHandoffVerified": False, "signedFragmentsVerified": fragment_count,
            "previouslyVerifiedFragmentsReused": reused_fragments,
            "fragmentReceiptSha256": hashlib.sha256(fragment_receipt.read_bytes()).hexdigest() if fragment_receipt else None}



def read_remote(url, *, opener=urlopen, sleeper=time.sleep, on_retry=None):
    """Retry transient transport failures only; SHA checks remain in verify()."""
    for attempt in range(1, 4):
        try:
            with opener(Request(url, headers={"Cache-Control": "no-cache"}), timeout=60) as response:
                if response.status != 200:
                    raise ValueError(f"Remote HTTP {response.status}: {url}")
                return response.read(), response.headers
        except (HTTPError, URLError, TimeoutError, IncompleteRead, ConnectionError) as error:
            if isinstance(error, HTTPError) and error.code not in (408, 429, 500, 502, 503, 504):
                raise
            if attempt == 3:
                raise RuntimeError(f"Remote transport failed after {attempt} attempts: {url}") from error
            if on_retry:
                on_retry({"url": url, "failedAttempt": attempt, "error": type(error).__name__})
            sleeper(attempt)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--site", required=True, type=Path)
    parser.add_argument("--url", required=True)
    parser.add_argument("--all-fragments", action="store_true")
    parser.add_argument("--fragment-receipt", type=Path, help="Resume per-file SHA proofs on the same immutable deploy/index only")
    parser.add_argument("--workers", type=int, default=2)
    args = parser.parse_args()

    def read(url):
        return read_remote(url, on_retry=lambda event: print(json.dumps(event), file=sys.stderr, flush=True))

    print(json.dumps(verify(args.site, args.url, read,
                            all_fragments=args.all_fragments, fragment_receipt=args.fragment_receipt, workers=args.workers), sort_keys=True))


if __name__ == "__main__":
    main()
