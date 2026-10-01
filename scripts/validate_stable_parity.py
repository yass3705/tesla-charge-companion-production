#!/usr/bin/env python3
import hashlib
import pathlib
import sys

def sha(path):
    h=hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda:f.read(1024*1024), b""):
            h.update(chunk)
    return h.hexdigest()

def main():
    stable=pathlib.Path(sys.argv[1])/"v9-production-runtime"
    snap=pathlib.Path(sys.argv[2])/"runtime"
    allow_tesla_override="--allow-tesla-override" in sys.argv[3:]
    critical=[
      "data/tesla_stations.json",
      "data/v9/spain-static/manifest.json",
      "data/v9/spain-static/all.json.gz",
      "data/non_tesla_netherlands/manifest.json",
      "data/non_tesla_netherlands/all.json.gz",
      "data/v9/switzerland-static/manifest.json",
      "data/v9/italy-static/manifest.json",
      "data/v9/italy-static/all.json.gz",
      "assets/v9/pricing-engine.js",
      "assets/v9/runtime-engine.js",
      "assets/v9/routing-engine.js",
      "assets/v9/browser-loaders.js",
      "assets/v9/browser-routing.js"
    ]
    if allow_tesla_override:
        critical=[rel for rel in critical if rel!="data/tesla_stations.json"]
        tesla=snap/"data/tesla_stations.json"
        assert tesla.exists() and tesla.stat().st_size>0, "Data Lab Tesla override missing/empty"
    checked=0
    for rel in critical:
        a=stable/rel
        b=snap/rel
        assert a.exists(), f"stable critical file missing: {rel}"
        assert b.exists(), f"snapshot critical file missing: {rel}"
        assert sha(a)==sha(b), f"baseline parity drift: {rel}"
        checked+=1

    # New overlays must coexist with, not replace, the stable baseline.
    root=pathlib.Path(sys.argv[2])
    required=[
      "runtime-contract.json",
      "snapshot-inputs/CH/switzerland_public_charging_v9.json",
      "snapshot-inputs/FR/france_public_charging_canonical.json",
      "snapshot-inputs/DE/manifest.json",
      "snapshot-inputs/DE/all.json.gz",
      "snapshot-inputs/UK/manifest.json",
      "snapshot-inputs/UK/all.json.gz",
      "snapshot-inputs/MA/manifest.json"
    ]
    if allow_tesla_override:
        required.append("snapshot-inputs/TESLA/suc-tracker-metadata.json")
    for rel in required:
        assert (root/rel).exists(), f"overlay missing: {rel}"

    print(f"PARITY PASS critical_files={checked} overlays={len(required)} tesla_override={allow_tesla_override}")

if __name__=="__main__":
    main()
