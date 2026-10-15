"""Verify an immutable Data Lab copy of the last validated Italy V9 runtime."""

import gzip
import hashlib
import json
import pathlib
import shutil


def sha256(path):
    h = hashlib.sha256()
    with pathlib.Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def verify_and_copy(source, historical, target, expected_bundle_sha):
    source = pathlib.Path(source)
    historical = pathlib.Path(historical)
    target = pathlib.Path(target)
    bundle_path = source / "bundle.json"
    if sha256(bundle_path) != expected_bundle_sha:
        raise ValueError("Pinned Italy bundle SHA256 mismatch")
    proof = json.loads(bundle_path.read_text(encoding="utf-8"))
    if proof.get("country") != "IT" or proof.get("mode") != "preserved_validated_v9_runtime":
        raise ValueError("Italy Data Lab bundle provenance mismatch")
    static = source / "italy-static"
    if sha256(static / "manifest.json") != proof["staticManifestSha256"]:
        raise ValueError("Italy static manifest SHA256 mismatch")
    manifest = json.loads((static / "manifest.json").read_text(encoding="utf-8"))
    if manifest.get("country") != "IT" or manifest["stationCount"] != proof["stations"]:
        raise ValueError("Italy static count mismatch")
    if manifest["stationCount"] != json.loads((historical / "italy-static/manifest.json").read_text())["stationCount"]:
        raise ValueError("Italy station coverage differs from validated baseline")
    for name, digest in [(manifest["allFile"], manifest["allSha256"])] + [(t["file"], t["sha256"]) for t in manifest["tiles"]]:
        path = static / name
        if path.parent != static or sha256(path) != digest:
            raise ValueError(f"Italy tile SHA256 mismatch: {name}")
    if sha256(static / "manifest.json") != sha256(historical / "italy-static/manifest.json"):
        raise ValueError("Italy static manifest differs from validated baseline")
    archive = source / "italy-offers.json.gz"
    if sha256(archive) != proof["compressedOffersSha256"]:
        raise ValueError("Italy compressed offers SHA256 mismatch")
    if proof["sourceOffersSha256"] != sha256(historical / "italy-offers.json"):
        raise ValueError("Italy offers differ from validated baseline")
    with gzip.open(archive, "rt", encoding="utf-8") as stream:
        offers = json.load(stream)
    if offers.get("country") != "IT":
        raise ValueError("Italy offer country mismatch")
    for key in ("directOffers", "subscriptionOffers", "emspOffers"):
        if not offers.get(key) or len(offers[key]) != proof[key]:
            raise ValueError(f"Italy {key} count mismatch")
    target.mkdir(parents=True, exist_ok=True)
    if (target / "italy-static").exists():
        shutil.rmtree(target / "italy-static")
    shutil.copytree(static, target / "italy-static")
    with gzip.open(archive, "rb") as compressed, (target / "italy-offers.json").open("wb") as raw:
        shutil.copyfileobj(compressed, raw)
    if sha256(target / "italy-offers.json") != proof["sourceOffersSha256"]:
        raise ValueError("Italy offers changed during materialization")
    return proof
