#!/usr/bin/env python3
"""Reconcile historical Bois-d'Arcy IRVE aliases with Electra's current station card."""
import argparse
import gzip
import json
import pathlib

ACTIVE = "FRELCP12954082"
HISTORICAL = {"FRELCP5265355", "FRELCPBDALE"}


def build(national):
    rows = {row[0]: row for row in national if row[0] in {ACTIVE, *HISTORICAL}}
    if set(rows) != {ACTIVE, *HISTORICAL}:
        raise ValueError("Bois-d'Arcy national station aliases changed")
    active = rows[ACTIVE]
    dc = [config for config in active[8] if config[2] == "DC"]
    if sum(config[4] for config in dc) != 19 or sorted((config[3], config[4]) for config in dc) != [(100.0, 1), (400.0, 12), (600.0, 6)]:
        raise ValueError("Bois-d'Arcy DC inventory no longer matches Electra's 19 current connectors")

    def fragment(row, evses):
        return {
            "canonicalId": f"FR:national:{row[0]}", "sourceStationId": row[0],
            "countryCode": "FR", "name": row[1], "address": row[2],
            "latitude": row[3], "longitude": row[4],
            "physicalOperator": {"name": "Electra"}, "evses": evses,
            "updatedAt": "2026-10-06",
        }

    evses = [{
        "id": config[0], "stalls": config[4], "pdcIds": config[6],
        "connectors": [{"id": f"{config[0]}:connector", "kind": "DC", "powerKw": config[3]}],
    } for config in dc]
    stations = [fragment(active, evses)] + [fragment(rows[alias], []) for alias in sorted(HISTORICAL)]
    return {
        "schemaVersion": 1, "country": "FR", "sourceSnapshotAt": "2026-10-06",
        "mode": "exact_current_station_connector_reconciliation",
        "evidence": {
            "officialUrl": "https://stations.go-electra.com/fr/bois-d-arcy-e-leclerc",
            "officialConnectorCount": 19,
            "officialPowersKw": [100, 400, 600],
            "decision": "Current official station lists 19 DC connectors and no AC connector; hide historical 22 kW aliases.",
        },
        "stations": stations,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("national", type=pathlib.Path)
    parser.add_argument("output", type=pathlib.Path)
    args = parser.parse_args()
    with gzip.open(args.national, "rt", encoding="utf-8") as stream:
        payload = build(json.load(stream))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
