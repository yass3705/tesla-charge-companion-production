"""Verify an immutable Data Lab copy of the Mac-published Tesla catalogue."""
from datetime import date
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
    if not isinstance(rows, list) or type(manifest.get("stationCount")) is not int or len(rows) != manifest["stationCount"]:
        raise ValueError("Tesla Mac station count mismatch")
    ids = [row.get("id") for row in rows if isinstance(row, dict)]
    if len(ids) != len(rows) or any(not isinstance(value, str) or not value.strip() for value in ids) or len(ids) != len(set(ids)):
        raise ValueError("Tesla Mac station IDs missing or duplicated")
    if any(not isinstance(row.get("pricing"), dict) or not row.get("countryCode")
           or not row.get("chargingConfigurations") for row in rows):
        raise ValueError("Tesla Mac station country, pricing or configurations missing")
    countries = {row["countryCode"] for row in rows}
    if (manifest.get("sourceRepository") != "yass3705/tesla-charge-companion-production"
            or manifest.get("sourcePath") != "data/tesla/mac/staging/catalogue.json"):
        raise ValueError("Unexpected Tesla Mac ingress provenance")
    commit = manifest.get("catalogueCommit")
    if commit is not None and not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise ValueError("Invalid Tesla Mac catalogue commit")
    if expected_sha and (not re.fullmatch(r"[0-9a-f]{40}", expected_sha)):
        raise ValueError("Invalid pinned Data Lab commit")
    dates = manifest.get("countryDates")
    if not isinstance(dates, dict) or not countries.issubset(dates):
        raise ValueError("Missing Mac country dates")
    updated = manifest.get("countriesUpdated")
    if not isinstance(updated, list) or (not rows and not updated) or not all(isinstance(code, str) and code in dates for code in updated):
        raise ValueError("Missing scope of the published Mac lot")
    for code, stamp in dates.items():
        if not re.fullmatch(r"[A-Z]{2}", code) or not isinstance(stamp, str) or date.fromisoformat(stamp).isoformat() != stamp:
            raise ValueError("Invalid Mac country or collection date")
    return {"catalogueSha256": digest, "catalogueBytes": len(raw),
            "stationCount": len(rows), "countryCount": len(countries),
            "catalogueCommit": commit, "dataLabSha": expected_sha,
            "countryDates": dates}, source
