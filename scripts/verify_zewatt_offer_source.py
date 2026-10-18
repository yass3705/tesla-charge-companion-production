"""Guard the pinned Data Lab Ze-Watt direct offer handoff."""

import hashlib
import json


def inspect(path):
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("country") != "FR" or data.get("mode") != "verified_zewatt_direct":
        raise ValueError("Unexpected Ze-Watt offer source")
    offers = data.get("directOffers")
    if not isinstance(offers, list) or not offers:
        raise ValueError("Ze-Watt direct offers disappeared")
    ids = set()
    for offer in offers:
        if offer.get("directOperatorOnly") is not True or offer.get("verifiedScope") != "exact_evse":
            raise ValueError("Ze-Watt offer lost its exact direct scope")
        if offer.get("metadata", {}).get("visitorStripeRequired") is not True:
            raise ValueError("Ze-Watt non-guest offer cannot become direct")
        evse_ids = offer.get("evseIds")
        if not isinstance(evse_ids, list) or not evse_ids:
            raise ValueError("Ze-Watt offer has no exact EVSE identity")
        if not isinstance(offer.get("pricing"), dict) or not offer["pricing"]:
            raise ValueError("Ze-Watt offer lost its price rules")
        if ids.intersection(evse_ids):
            raise ValueError("Ze-Watt EVSE occurs in multiple direct profiles")
        ids.update(evse_ids)
    expected = data.get("sourceEvidence", {}).get("summary", {}).get("exactEvseIds")
    if expected is not None and expected != len(ids):
        raise ValueError("Ze-Watt source evidence EVSE count mismatch")
    return {"offerProfiles": len(offers), "exactEvseIds": len(ids)}


def verify_handoff(source, expected_sha256, historical):
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    if digest != expected_sha256:
        raise ValueError("Pinned Ze-Watt Data Lab SHA256 mismatch")
    current = inspect(source)
    previous = inspect(historical)
    return {"sourceSha256": digest, "historical": previous, "dataLab": current}
