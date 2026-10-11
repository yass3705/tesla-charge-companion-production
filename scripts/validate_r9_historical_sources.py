#!/usr/bin/env python3
"""Exact source contract for the immutable r9 Electra/early Electroverse snapshot."""
import hashlib
import json
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[1]
RECORD = ROOT / "config/r9-electra-historical-provenance.json"
COMPILER = ROOT / "scripts/build_electroverse_r9_evse_overlay.mjs"


def digest(path):
    h = hashlib.sha256()
    with pathlib.Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def require(actual, expected, label):
    if actual != expected:
        raise ValueError(f"r9 historical provenance {label}: expected {expected}, got {actual}")


def checkout_sha(path):
    return subprocess.check_output(["git", "-C", str(path), "rev-parse", "HEAD"], text=True).strip()


def load_record(config, datalab_sha=None, stable_sha=None):
    record = json.loads(RECORD.read_text(encoding="utf-8"))
    require(record["schemaVersion"], 1, "schema")
    require(config.get("snapshotId"), record["snapshotId"], "snapshot ID")
    require(config.get("sources", {}).get("dataLab", {}).get("sha"), record["dataLabSha"], "Data Lab pin")
    if "sourceSelection" in config:
        require(config["sourceSelection"].get("selectedDataLabCommit"), record["dataLabSha"], "selected Data Lab pin")
    require(config.get("sources", {}).get("stable", {}).get("sha"), record["stableSha"], "Stable pin")
    if datalab_sha is not None:
        require(datalab_sha, record["dataLabSha"], "Data Lab checkout")
    if stable_sha is not None:
        require(stable_sha, record["stableSha"], "Stable checkout")
    require(digest(COMPILER), record["electroverseCompilerSha256"], "compiler")
    return record


def validate_sources(config, datalab, stable):
    datalab, stable = pathlib.Path(datalab), pathlib.Path(stable)
    record = load_record(config, checkout_sha(datalab), checkout_sha(stable))
    checks = {
        "nationalFranceSha256": datalab / "data/national/france_public_charging_canonical.json",
        "electraManifestSha256": datalab / "data/platforms/electra/france/manifest.json",
        "electroverseCacheManifestSha256": datalab / "data/electroverse/tariff_cache/manifest.json",
        "electroverseMappingSha256": datalab / "data/electroverse/irve_location_mapping.json",
    }
    for field, path in checks.items():
        require(digest(path), record[field], field)
    electra_dir = datalab / "data/platforms/electra/france"
    electra = json.loads((electra_dir / "manifest.json").read_text(encoding="utf-8"))
    require(electra.get("stats", {}).get("publishedOffers"), record["electraPublishedOffers"], "Electra offers")
    require(electra.get("stats", {}).get("publishedEvseIds"), record["electraPublishedEvseIds"], "Electra EVSEs")
    require(len(electra.get("tiles", [])), record["electraTileCount"], "Electra tiles")
    for tile in electra["tiles"]:
        path = electra_dir / tile["file"]
        require(path.stat().st_size, tile["bytes"], f"Electra tile size {tile['file']}")
        require(digest(path), tile["sha256"], f"Electra tile {tile['file']}")
    cache_dir = datalab / "data/electroverse/tariff_cache"
    cache = json.loads((cache_dir / "manifest.json").read_text(encoding="utf-8"))
    require(cache.get("shardCount"), 128, "Electroverse shard count")
    shards = cache.get("shards", [])
    require(len(shards), 128, "Electroverse listed shards")
    names = [row["file"] for row in shards]
    require(len(set(names)), 128, "Electroverse unique shards")
    h = hashlib.sha256()
    for name in sorted(names):
        if pathlib.Path(name).name != name:
            raise ValueError("r9 historical provenance invalid Electroverse shard path")
        h.update(f"{name} {digest(cache_dir / name)}\n".encode())
    require(h.hexdigest(), record["electroverseCacheShardsSha256"], "Electroverse shard set")
    if (datalab / "data/platforms/electroverse/france-evse/manifest.json").exists():
        raise ValueError("r9 historical pin unexpectedly contains a compiled Electroverse EVSE overlay")
    return record


def validate_compiled(root, record):
    root = pathlib.Path(root)
    manifest_path = root / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    require(manifest.get("stats"), record["electroverseExpectedStats"], "compiled Electroverse counts")
    require(manifest.get("rejected"), record["electroverseExpectedRejected"], "Electroverse rejection ledger")
    policy = manifest.get("policy", {})
    for key in ("nationalFranceIsIdentityHub", "exactUniqueNationalPdcOnly", "evseLevelPricing",
                "stationLevelFlattening", "electraDependency", "proximityInference",
                "heterogeneousConnectorsWithinEvseFailClosed", "unsupportedPricingFailClosed"):
        require(policy.get(key), key not in ("stationLevelFlattening", "electraDependency", "proximityInference"),
                f"Electroverse {key}")
    require(len(manifest.get("tiles", [])), manifest.get("tileCount"), "Electroverse tile count")
    require(sum(x["count"] for x in manifest["tiles"]), record["electroverseExpectedStats"]["publishedOffers"], "Electroverse tile offers")
    for tile in manifest["tiles"]:
        path = root / tile["file"]
        require(path.stat().st_size, tile["bytes"], f"Electroverse tile size {tile['file']}")
        require(digest(path), tile["sha256"], f"Electroverse tile {tile['file']}")
    return manifest


def validate_built_sources(root, record):
    root = pathlib.Path(root)
    provenance = root / "historical-provenance.json"
    require(json.loads(provenance.read_text(encoding="utf-8")), record, "embedded record")
    cache_dir = root / "tariff_cache"
    require(digest(cache_dir / "manifest.json"), record["electroverseCacheManifestSha256"], "embedded cache manifest")
    require(digest(root / "irve_location_mapping.json"), record["electroverseMappingSha256"], "embedded mapping")
    manifest = json.loads((cache_dir / "manifest.json").read_text(encoding="utf-8"))
    names = [row["file"] for row in manifest.get("shards", [])]
    require(len(names), 128, "embedded cache shard count")
    require(len(set(names)), 128, "embedded cache unique shards")
    h = hashlib.sha256()
    for name in sorted(names):
        if pathlib.Path(name).name != name:
            raise ValueError("r9 historical provenance invalid embedded shard path")
        h.update(f"{name} {digest(cache_dir / name)}\n".encode())
    require(h.hexdigest(), record["electroverseCacheShardsSha256"], "embedded cache shard set")
