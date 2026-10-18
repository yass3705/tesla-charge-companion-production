"""Verify pinned Zephyre direct offers before replacing the Stable copy."""

import hashlib
import json


def inspect(path):
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("country") != "FR" or data.get("mode") != "verified_zephyre_direct":
        raise ValueError("Unexpected Zephyre offer source")
    offers = data.get("directOffers")
    if not isinstance(offers, list) or not offers:
        raise ValueError("Zephyre direct offers disappeared")
    ids = set()
    for offer in offers:
        if offer.get("directOperatorOnly") is not True or offer.get("verifiedScope") != "exact_evse":
            raise ValueError("Zephyre direct offer lost exact EVSE scope")
        values = offer.get("evseIds")
        if not isinstance(values, list) or not values or not offer.get("pricing"):
            raise ValueError("Zephyre offer lost EVSE identities or price rules")
        if ids.intersection(values):
            raise ValueError("Zephyre EVSE occurs in multiple direct profiles")
        ids.update(values)
    expected = data.get("sourceEvidence", {}).get("exactEvseIds")
    if expected is not None and expected != len(ids):
        raise ValueError("Zephyre source evidence EVSE count mismatch")
    return {"offerProfiles": len(offers), "exactEvseIds": len(ids)}


def verify_handoff(source, expected_sha256, historical):
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    if digest != expected_sha256:
        raise ValueError("Pinned Zephyre Data Lab SHA256 mismatch")
    current = inspect(source)
    previous = inspect(historical)
    return {"sourceSha256": digest, "historical": previous, "dataLab": current}
