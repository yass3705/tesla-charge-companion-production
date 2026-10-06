#!/usr/bin/env python3
"""Report pinned Electroverse source coverage for user-reported French stations."""
import argparse
import json
import math
from pathlib import Path

TARGETS = {
    "lidl-dole-LFR3233EVCP01": {"ids": {"FRLDLPLFR3233EVCP"}, "lat": 47.08248, "lon": 5.48995},
    "electra-bois-darcy": {"ids": {"FRELCP12954082", "FRELCP5265355", "FRELCPBDALE"}, "lat": 48.79955, "lon": 2.039},
}


def distance(a, b, c, d):
    return 111195 * math.hypot(a - c, (b - d) * math.cos(math.radians(a)))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("datalab", type=Path)
    parser.add_argument("snapshot", type=Path)
    args = parser.parse_args()
    root = args.datalab
    mapping = json.loads((root / "data/electroverse/irve_location_mapping.json").read_text())["mappings"]
    offers = json.loads((args.snapshot / "snapshot-inputs/FR/platforms/electroverse-runtime-offers.json").read_text())["emspOffers"]
    cache = {}
    for path in (root / "data/electroverse/tariff_cache").glob("shard-*.json"):
        for key, row in json.loads(path.read_text()).get("stations", {}).items():
            cache[str(key)] = row
    output = {}
    for label, target in TARGETS.items():
        nearby = []
        for row in mapping:
            irve = row.get("irve") or {}
            lat, lon = irve.get("lat"), irve.get("lon")
            if not isinstance(lat, (float, int)) or not isinstance(lon, (float, int)):
                continue
            metres = distance(target["lat"], target["lon"], lat, lon)
            if metres <= 100:
                pk = str(row.get("electroverseLocationPk") or "")
                nearby.append({
                    "distanceM": round(metres, 1),
                    "irveStationId": row.get("irveStationId"),
                    "name": irve.get("name"),
                    "operator": irve.get("operator"),
                    "confidence": row.get("confidence"),
                    "electroverseLocationPk": pk,
                    "cachedTariff": pk in cache,
                    "cachedIrveStationId": cache.get(pk, {}).get("irveStationId"),
                })
        exact_cache = [
            {"pk": pk, "irveStationId": row.get("irveStationId"), "fetchedAt": row.get("fetchedAt")}
            for pk, row in cache.items() if row.get("irveStationId") in target["ids"]
        ]
        matched_offers = [
            {"id": row.get("id"), "stationIds": row.get("stationIds"), "metadata": row.get("metadata")}
            for row in offers if target["ids"].intersection(row.get("stationIds") or [])
        ]
        output[label] = {
            "exactCache": exact_cache,
            "runtimeOffers": matched_offers,
            "nearbyMappings": sorted(nearby, key=lambda row: row["distanceM"])[:12],
        }
    print(json.dumps(output, ensure_ascii=False))


if __name__ == "__main__":
    main()
