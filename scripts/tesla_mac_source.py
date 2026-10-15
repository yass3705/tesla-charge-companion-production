"""Verify an immutable Data Lab copy of the Mac-published Tesla catalogue."""
import hashlib
import json
import re
from pathlib import Path


def verify(root, expected_sha=None):
    root = Path(root)
    manifest_path = root / "data/tesla/mac/last-good.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("schemaVersion") != 1 or manifest.get("status") != "last-good":
        raise ValueError("Tesla Mac source is not marked last-good")
    if manifest.get("cataloguePath") != "data/tesla/mac/catalogue.json":
        raise ValueError("Unexpected Tesla Mac catalogue path")
    source = root / manifest["cataloguePath"]
    raw = source.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if digest != manifest.get("catalogueSha256") or len(raw) != manifest.get("catalogueBytes"):
        raise ValueError("Tesla Mac catalogue SHA-256 or byte count mismatch")
    rows = json.loads(raw)
    if not isinstance(rows, list) or len(rows) != manifest.get("stationCount") or len(rows) < 1100:
        raise ValueError("Tesla Mac station count mismatch")
    ids = [row.get("id") for row in rows if isinstance(row, dict)]
    if len(ids) != len(rows) or len(ids) != len(set(ids)) or any(not value for value in ids):
        raise ValueError("Tesla Mac station IDs missing or duplicated")
    if any(not isinstance(row.get("pricing"), dict) or not row.get("countryCode")
           or not row.get("chargingConfigurations") for row in rows):
        raise ValueError("Tesla Mac station country, pricing or configurations missing")
    countries = {row["countryCode"] for row in rows}
    if not {"BE", "CH", "DE", "ES", "FR", "GB", "IT", "LU", "MA", "NL", "PT"}.issubset(countries):
        raise ValueError("Tesla Mac catalogue missing a historic country")
    commit = manifest.get("catalogueCommit")
    if commit is not None and not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise ValueError("Invalid Tesla Mac catalogue commit")
    if expected_sha and (not re.fullmatch(r"[0-9a-f]{40}", expected_sha)):
        raise ValueError("Invalid pinned Data Lab commit")
    dates = manifest.get("countryDates")
    if not isinstance(dates, dict) or not countries.issubset(dates):
        raise ValueError("Missing Mac country dates")
    return {"catalogueSha256": digest, "catalogueBytes": len(raw),
            "stationCount": len(rows), "countryCount": len(countries),
            "catalogueCommit": commit, "dataLabSha": expected_sha,
            "countryDates": dates}, source
