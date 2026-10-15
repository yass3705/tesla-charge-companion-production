"""Verify exact Data Lab custody of the last validated France IRVE tile generation."""

import hashlib
import json
import pathlib
import shutil


def sha256(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def hashes(root):
    return {str(path.relative_to(root)): sha256(path)
            for path in root.rglob("*") if path.is_file()}


def verify_and_copy(bundle, historical, target, expected_provenance_sha, stable_sha):
    bundle = pathlib.Path(bundle)
    historical = pathlib.Path(historical)
    target = pathlib.Path(target)
    provenance = bundle / "provenance.json"
    if sha256(provenance) != expected_provenance_sha:
        raise ValueError("Pinned France last-good provenance SHA256 mismatch")
    proof = json.loads(provenance.read_text(encoding="utf-8"))
    if (proof.get("mode") != "preserved_validated_france_irve_static"
            or proof.get("sourceSha") != stable_sha):
        raise ValueError("France last-good source provenance mismatch")
    source = bundle / "france-static"
    source_hashes = hashes(source)
    historical_hashes = hashes(historical)
    if source_hashes != historical_hashes:
        missing = sorted(set(historical_hashes) - set(source_hashes))
        extra = sorted(set(source_hashes) - set(historical_hashes))
        changed = sorted(k for k in source_hashes.keys() & historical_hashes.keys()
                         if source_hashes[k] != historical_hashes[k])
        raise ValueError(f"France last-good generation differs: missing={missing[:8]} extra={extra[:8]} changed={changed[:8]}")
    manifest = json.loads((source / "manifest.json").read_text(encoding="utf-8"))
    if (manifest.get("stationCount") != proof.get("stationCount")
            or manifest.get("pdcCount") != proof.get("pdcCount")
            or sha256(source / "manifest.json") != proof.get("manifestSha256")
            or len(source_hashes) != proof.get("fileCount")):
        raise ValueError("France last-good manifest/provenance mismatch")
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(source, target)
    return {"stationCount": proof["stationCount"], "pdcCount": proof["pdcCount"],
            "fileCount": len(source_hashes), "allSha256": proof["allSha256"],
            "provenanceSha256": expected_provenance_sha}
