#!/usr/bin/env python3
"""Measure pinned FR eMSP offer joins against the actual pinned national EVSEs."""
import argparse
import collections
import gzip
import json
from pathlib import Path


def norm(value):
    return "".join(char for char in str(value or "").upper() if char.isalnum())


def national_index(stable):
    source = stable / "v9-production-runtime/data/v9/france-static/all.json.gz"
    rows = json.load(gzip.open(source, "rt", encoding="utf-8"))
    evse_to_stations = collections.defaultdict(set)
    for row in rows:
        station_id = row[0]
        for group in row[8] or []:
            for evse_id in group[6] or []:
                evse_to_stations[norm(evse_id)].add(station_id)
    return rows, evse_to_stations


def audit_platform(datalab, platform, evse_to_stations):
    root = datalab / "data/platforms" / platform
    manifest = json.loads((root / "manifest.json").read_text())
    modes, examples = collections.Counter(), []
    counts = collections.Counter()
    for tile in manifest["tiles"]:
        offers = json.load(gzip.open(root / tile["file"], "rt", encoding="utf-8")).get("emspOffers", [])
        for offer in offers:
            counts["sourceOffers"] += 1
            mode = (offer.get("metadata") or {}).get("identityMode") or "unspecified"
            modes[mode] += 1
            station_ids = set()
            for evse_id in offer.get("evseIds") or []:
                station_ids.update(evse_to_stations.get(norm(evse_id), ()))
            if not station_ids:
                counts["unmatchedOffers"] += 1
            elif len(station_ids) == 1:
                counts["uniqueStationOffers"] += 1
            else:
                counts["multiStationOffers"] += 1
                if len(examples) < 10:
                    examples.append({"offerId": offer.get("id"), "stations": sorted(station_ids)})
    assert counts["sourceOffers"] == manifest["stats"]["publishedOffers"]
    return {**counts, "identityModes": dict(modes), "multiStationExamples": examples}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--stable", type=Path, required=True)
    parser.add_argument("--datalab", type=Path, required=True)
    parser.add_argument("--min-electra-joined", type=int, default=0)
    parser.add_argument("--min-electroverse-joined", type=int, default=0)
    args = parser.parse_args()
    rows, index = national_index(args.stable)
    result = {"nationalStations": len(rows), "nationalEvseIds": len(index),
              "duplicateNationalEvseIds": sum(len(stations) > 1 for stations in index.values())}
    for key, path in (("electra", "electra/france"), ("electroverse", "electroverse/france-evse")):
        result[key] = audit_platform(args.datalab, path, index)
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    if result["electra"].get("multiStationOffers", 0) or result["electroverse"].get("multiStationOffers", 0):
        raise SystemExit("Offer identity maps to multiple national stations")
    if result["electra"].get("uniqueStationOffers", 0) < args.min_electra_joined or \
       result["electroverse"].get("uniqueStationOffers", 0) < args.min_electroverse_joined:
        raise SystemExit("Pinned eMSP identity coverage fell below validated baseline")


if __name__ == "__main__":
    main()
