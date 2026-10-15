"""Validate an immutable Data Lab REVE runtime bundle before snapshot assembly."""

import gzip
import hashlib
import json


def _load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def _verified_gzip(path, expected):
    if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        raise ValueError(f"REVE SHA256 mismatch: {path}")
    with gzip.open(path, "rt", encoding="utf-8") as stream:
        return json.load(stream)


def verify_bundle(root):
    static = root / "spain-static"
    offers = root / "spain-reve-offers"
    sm = _load(static / "manifest.json")
    om = _load(offers / "manifest.json")
    if (sm.get("country"), om.get("country")) != ("ES", "ES"):
        raise ValueError("REVE country mismatch")
    if sm.get("generatedAt") != om.get("generatedAt"):
        raise ValueError("REVE station and offer generations differ")
    stations = _verified_gzip(static / sm["allFile"], sm["allSha256"])
    if len(stations) != sm["stationCount"]:
        raise ValueError("REVE all-file station count mismatch")
    for directory, manifest, key in ((static, sm, "stationCount"), (offers, om, "offerCount")):
        count = 0
        for tile in manifest["tiles"]:
            payload = _verified_gzip(directory / tile["file"], tile["sha256"])
            rows = payload if directory == static else payload["directOffers"]
            if len(rows) != tile["count"]:
                raise ValueError(f"REVE tile count mismatch: {tile['file']}")
            count += len(rows)
        if count != manifest[key]:
            raise ValueError(f"REVE manifest total mismatch: {directory}")
    return {
        "generatedAt": sm["generatedAt"],
        "stations": sm["stationCount"],
        "uniqueEvseIds": sm["uniqueEvseIds"],
        "physicalEvseOccurrences": sm["physicalEvseOccurrences"],
        "directOffers": om["offerCount"],
    }
