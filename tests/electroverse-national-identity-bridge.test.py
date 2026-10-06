#!/usr/bin/env python3
"""Guard the conservative Electroverse-to-national station identity bridge."""
import gzip
import importlib.util
import json
import pathlib
import tempfile

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts/build_electroverse_runtime_offers.py"
if not SCRIPT.exists():
    SCRIPT = pathlib.Path(__file__).resolve().with_name("build_electroverse_runtime_offers.py")
spec = importlib.util.spec_from_file_location("electroverse_builder", SCRIPT)
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


def station(station_id, name, lat, lon, operator="Electra", pdc="PDC-1"):
    return [station_id, name, "Rue exemple", lat, lon, operator, 1, [], [["AC", "AC", "AC", 22, 1, [], [pdc]]]]


def mapping(new_id, name, lat, lon, pdc="PDC-1", operator="Electra"):
    return {
        "irveStationId": new_id,
        "irvePdcIds": [pdc],
        "confidence": "high",
        "irve": {"name": name, "operator": operator, "lat": lat, "lon": lon},
    }


with tempfile.TemporaryDirectory() as temp:
    root = pathlib.Path(temp)
    national = root / "all.json.gz"
    source_mapping = root / "mapping.json"
    rows = [
        station("FR-OLD-1", "Gare de l'Est", 48.876, 2.359),
        station("FR-OLD-2", "Same-name site", 48.88, 2.36),
        station("FR-OLD-3", "Same-name site", 48.88002, 2.36),
        station("FR-OLD-4", "Different site", 48.89, 2.37),
    ]
    mappings = [
        mapping("FR-NEW-1", "Gare de l'Est", 48.8760005, 2.359, pdc="CHANGED-PDC"),
        mapping("FR-AMBIGUOUS", "Same-name site", 48.88001, 2.36),
        mapping("FR-WRONG-OPERATOR", "Different site", 48.89, 2.37, operator="Other"),
        mapping("FR-NEW-4A", "Different site", 48.89, 2.37),
        mapping("FR-NEW-4B", "Different site", 48.89, 2.37),
    ]
    with gzip.open(national, "wt", encoding="utf-8") as file:
        json.dump(rows, file)
    source_mapping.write_text(json.dumps({"mappings": mappings}), encoding="utf-8")
    national_ids, bridges = builder.national_identity_bridge(national, source_mapping)
    assert national_ids == {row[0] for row in rows}
    assert set(bridges) == {"FR-NEW-1"}, bridges
    assert bridges["FR-NEW-1"][0] == "FR-OLD-1"
    assert bridges["FR-NEW-1"][2] is False

print("Electroverse national identity bridge: unique exact-site match accepted; ambiguous identities rejected")
