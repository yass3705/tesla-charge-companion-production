#!/usr/bin/env python3
"""Compile only unique, exact Metropolis EVSE prices with complete public fees."""
import argparse
import collections
import gzip
import json
from pathlib import Path


def compile_offers(source_path: Path, static_path: Path):
    source = json.loads(source_path.read_text())
    stations = json.load(gzip.open(static_path, "rt"))
    index = collections.defaultdict(list)
    for station in stations:
        for group in station[8] or []:
            for evse in group[6] or []:
                index[evse].append((station, group))
    seen = set()
    offers = []
    excluded = collections.Counter()
    special = 0
    for row in source["exact"]:
        evse = row["id_pdc_itinerance"]
        if evse in seen:
            raise ValueError(f"Duplicate Metropolis exact EVSE: {evse}")
        seen.add(evse)
        matches = index.get(evse, [])
        if len(matches) != 1:
            excluded["missing_or_duplicate_static_evse"] += 1
            continue
        station, group = matches[0]
        if station[0] != row["id_station_itinerance"] or "spie citynetworks" not in station[5].lower():
            excluded["station_or_operator_mismatch"] += 1
            continue
        power = float(group[3])
        source_power = float(row["powerKw"])
        power_match = abs(power - source_power) <= 0.01 or (source_power == 7.0 and power == 7.4)
        if not power_match or group[2] not in ("AC", "DC"):
            excluded["power_or_connector_mismatch"] += 1
            continue
        energy = float(row["energyEurPerKwh"])
        grace = row["postChargeGraceMinutes"]
        if energy not in (0.44, 0.53, 0.63) or grace != 10:
            excluded["unexpected_tariff_component"] += 1
            continue
        schedule = row.get("postChargeSchedule")
        if schedule:
            expected = [("08:00", "20:00", 0.2), ("20:00", "08:00", 0.1)]
            actual = [(w.get("start"), w.get("end"), w.get("eurPerMinute")) for w in schedule]
            if actual != expected or row.get("postChargeEurPerMinute") is not None or "Neuilly-sur-Seine" not in row["station"]:
                excluded["unexpected_post_charge_schedule"] += 1
                continue
            post_fee = {"graceMinutes": 10, "localRateWindows": schedule}
            special += 1
        else:
            if row.get("postChargeEurPerMinute") is None:
                excluded["missing_post_charge_rate"] += 1
                continue
            idle = float(row["postChargeEurPerMinute"])
            if idle not in (0.1, 0.2):
                excluded["unexpected_tariff_component"] += 1
                continue
            post_fee = {"graceMinutes": 10, "blockMinutes": 1,
                        "blockEur": idle, "rounding": "started_block"}
        offers.append({
            "id": f"metropolis-direct:{evse}", "provider": "Métropolis Recharge",
            "kind": "direct", "country": "FR", "currency": "EUR",
            "stationIds": [station[0]], "evseIds": [evse],
            "verifiedScope": "exact_evse", "directOperatorOnly": True,
            "operatorIds": ["SPIE CityNetworks"], "connectorKinds": [group[2]],
            "source": row["sourceUrl"], "sourceId": "france-spie-metropolis-direct-exact",
            "pricing": {"type": "rules", "timeZone": "Europe/Paris",
                        "rules": [{"scope": "allDay", "start": "00:00", "end": "24:00",
                                   "currency": "EUR", "pricePerKwh": energy,
                                   "energyRounding": "started_kwh"}],
                        "postChargeFee": post_fee},
            "note": f"{row['rule']}; exact EVSE; 10-minute post-charge grace"
                    + ("; Neuilly local day/night rates" if schedule else ""),
        })
    if len(seen) != len(source["exact"]):
        raise ValueError("Metropolis source exact list contains duplicate EVSE IDs")
    if len(offers) + sum(excluded.values()) != len(source["exact"]):
        raise AssertionError("Metropolis source accounting mismatch")
    return {"schemaVersion": 1, "country": "FR", "generatedAt": source["generatedAt"],
            "dataset": "metropolis-spie-direct-exact-v9",
            "policy": "Only unique exact EVSE, same national station/operator/power and complete official post-charge rule; Neuilly local day/night rates evaluated by session time",
            "directOffers": offers,
            "stats": {"sourceExact": len(source["exact"]), "compiled": len(offers),
                      "specialRateWindowOffers": special,
                      "excluded": dict(sorted(excluded.items()))}}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("static", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    result = compile_offers(args.source, args.static)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(result["stats"])


if __name__ == "__main__":
    main()
