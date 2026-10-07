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
    allow_mac_tesla_override="--allow-mac-tesla-override" in sys.argv[3:]
    allow_country_tesla_priority="--allow-country-tesla-priority" in sys.argv[3:]
    allow_nl_override="--allow-nl-override" in sys.argv[3:]
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
    if allow_tesla_override or allow_mac_tesla_override or allow_country_tesla_priority:
        critical=[rel for rel in critical if rel!="data/tesla_stations.json"]
        tesla=snap/"data/tesla_stations.json"
        assert tesla.exists() and tesla.stat().st_size>0, "Data Lab Tesla override missing/empty"
    if allow_mac_tesla_override:
        mac=pathlib.Path(sys.argv[1])/"data/tesla_stations.json"
        runtime=snap/"data/tesla_stations.json"
        assert mac.exists() and runtime.exists(), "Mac Tesla catalogue missing"
        assert sha(mac)==sha(runtime), "Mac Tesla catalogue differs from pinned Stable"
    if allow_country_tesla_priority:
        root=pathlib.Path(sys.argv[2])
        assert (root/"snapshot-inputs/TESLA/tariff-selection.json").exists(), "Tesla tariff selection report missing"
        assert (root/"snapshot-inputs/TESLA/mac-country-updates.json").exists(), "Mac country dates missing"
        assert (root/"snapshot-inputs/TESLA/suc-tracker-metadata.json").exists(), "SuC metadata missing"
    if allow_nl_override:
        critical=[rel for rel in critical if rel not in {
          "data/non_tesla_netherlands/manifest.json",
          "data/non_tesla_netherlands/all.json.gz"
        }]
        nl_manifest=snap/"data/non_tesla_netherlands/manifest.json"
        nl_all=snap/"data/non_tesla_netherlands/all.json.gz"
        assert nl_manifest.exists() and nl_manifest.stat().st_size>0, "Data Lab NL override manifest missing/empty"
        assert nl_all.exists() and nl_all.stat().st_size>0, "Data Lab NL override runtime missing/empty"
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
    if allow_mac_tesla_override:
        required.append("snapshot-inputs/TESLA/mac-suc-comparison.json")
    for rel in required:
        assert (root/rel).exists(), f"overlay missing: {rel}"

    print(f"PARITY PASS critical_files={checked} overlays={len(required)} tesla_override={allow_tesla_override} mac_tesla_override={allow_mac_tesla_override} nl_override={allow_nl_override}")

if __name__=="__main__":
    main()
