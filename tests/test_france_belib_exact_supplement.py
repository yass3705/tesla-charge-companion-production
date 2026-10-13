#!/usr/bin/env python3
"""Check the candidate preserves every pinned FR row and scopes new Belib prices."""
import gzip
import json
import sys
from pathlib import Path


def read_gzip(path):
    with gzip.open(path, "rt", encoding="utf-8") as handle:
        return json.load(handle)


def norm(value):
    return "".join(ch for ch in str(value or "").upper() if ch.isalnum())


def main(stable, datalab, candidate):
    old = read_gzip(stable / "v9-production-runtime/data/v9/france-static/all.json.gz")
    new = read_gzip(candidate / "runtime/data/v9/france-static/all.json.gz")
    old_by_id = {row[0]: row for row in old}
    new_by_id = {row[0]: row for row in new}
    expected = {"FRV75PPX0750": 5, "FRV75PPX1633": 4, "FRV75PPX1634": 5, "FRV75PPX1817": 3}
    bump = candidate / "snapshot-inputs/FR/bump-active-supplement.json"
    bump_ids = set()
    if bump.exists():
        evidence = json.loads((Path(__file__).resolve().parents[1] / "data/overlays/france-bump-active-supplement-evidence-2026-10-13.json").read_text())
        bump_ids = {station["nationalStationId"] for station in evidence["stations"]}
        assert len(bump_ids) == json.loads(bump.read_text())["stationCount"]
    assert set(new_by_id) - set(old_by_id) == set(expected) | bump_ids
    assert all(new_by_id[key] == row for key, row in old_by_id.items()), "Pinned FR row was altered"
    dynamic = read_gzip(datalab / "data/national/france-irve-dynamic-status-v9.json.gz")
    active = {norm(value) for value in dynamic["enServicePdcIds"]}
    offers = json.loads((candidate / "runtime/data/v9/france-belib-offers.json").read_text())
    direct = offers["directOffers"]
    for station_id, count in expected.items():
        row = new_by_id[station_id]
        ids = {norm(value) for group in row[8] for value in group[6]}
        assert len(ids) == count and ids <= active
        assert row[6] == count
        assert all(group[2] == "AC" and group[3] == 7.0 and group[4] == count for group in row[8])
        scoped = [offer for offer in direct if offer["id"].split(":")[1] == station_id]
        assert len(scoped) == 1
        assert {norm(value) for offer in scoped for value in offer["evseIds"]} == ids
        assert all(offer["verifiedScope"] == "exact_evse" for offer in scoped)
    assert len(new) == len(old) + 4 + len(bump_ids)
    print(json.dumps({"preservedPinnedStations": len(old), "addedBelibStations": 4,
                      "addedExactActiveEvse": sum(expected.values())}))


if __name__ == "__main__":
    main(*(Path(arg) for arg in sys.argv[1:4]))
