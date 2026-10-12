#!/usr/bin/env python3
"""Fail-closed IZIVIA FAST direct-offer staging without synthetic EVSE IDs."""
import argparse
import json
import math
import re
from pathlib import Path

EXCLUDED = {"FRIZFPFAST339","FRIZFPFAST408","FRIZFPFAST560","FRIZFPFAST730"}


def materialize(offers_src, inventory_src):
    offers = json.loads(Path(offers_src).read_text(encoding="utf-8"))
    inv = json.loads(Path(inventory_src).read_text(encoding="utf-8"))
    policy = offers.get("policy", {})
    assert offers.get("country") == inv.get("country") == "FR"
    assert offers.get("mode") == "exact_station_direct_tariff"
    assert policy.get("exactStationIdsOnly") is True and policy.get("networkDefault") is False
    assert policy.get("fastOnly") is True and policy.get("expressExcluded") is True
    assert policy.get("capturedStations") == 620 and policy.get("pricedStations") == 616
    assert {s["stationId"] for s in policy.get("excludedStations",[])} == EXCLUDED
    assert not offers.get("subscriptionOffers")
    stations = {s["sourceStationId"]: s for s in inv["stations"]}
    assert len(stations) == len(inv["stations"]) == 616
    assert all(re.fullmatch(r"FRIZFPFAST\d+", sid) for sid in stations)
    for sid, station in stations.items():
        assert station.get("canonicalId") == "FR:national:"+sid
        assert station.get("countryCode") == "FR"
        assert station.get("networkBrand") == "IZIVIA FAST"

    result = []
    stripped = 0
    for offer in offers["directOffers"]:
        assert offer.get("directOperatorOnly") is True
        assert offer.get("countries") == ["FR"] and offer.get("currency") == "EUR"
        kind = offer.get("connectorKinds")
        assert kind in (["AC"],["DC"])
        power = offer["metadata"]["powerKw"]
        assert isinstance(power,(int,float)) and math.isfinite(power)
        assert offer.get("minPowerKw") <= power <= offer.get("maxPowerKw")
        assert offer["pricing"].get("priceSelectionBasis") == "session_start_local_time"
        assert offer["metadata"].get("timeZone") == "Europe/Paris"
        rules = offer["pricing"]["rules"]
        assert len(rules) == 5
        assert [(r["start"],r["end"],r["pricePerKwh"]) for r in rules] == [
            ("00:00","09:00",0.35),("09:00","11:00",0.30),
            ("11:00","15:00",0.35),("15:00","17:00",0.30),
            ("17:00","24:00",0.35)]
        assert all(r.get("connectedTimeFreeMinutes")==60 and
                   r.get("connectedTimePerMinuteAfterFreeEur")==0.30 and
                   r.get("energyRounding")=="started_kwh" for r in rules)
        valid=[]
        for sid in offer["stationIds"]:
            assert sid in stations
            supported=False
            for evse in stations[sid]["evses"]:
                evse_id=evse.get("id","").lower()
                # Technical connector IDs are NOT independent EVSE identity evidence.
                # Reject CHAdeMO even when the national capture classifies it as DC.
                if evse_id.startswith("izivia-map-t2-") and kind == ["AC"]:
                    pass
                elif evse_id.startswith("izivia-map-combo_t2-") and kind == ["DC"]:
                    pass
                else:
                    continue
                for conn in evse.get("connectors",[]):
                    if conn.get("kind")==kind[0] and abs(float(conn.get("powerKw",0))-power)<0.01:
                        supported=True
            if supported:
                valid.append(sid)
            else:
                stripped+=1
        if valid:
            assert len(set(valid))==len(valid)
            result.append({**offer, "stationIds":valid,
                           "pricing":{**offer["pricing"],"rules":[{**rule,"connectedTimeAfterFreeStepSeconds":60} for rule in rules]},
                           "metadata":{**offer["metadata"],"stationCount":len(valid),
                                       "validation":"exact_FAST_station_and_supported_connector_power"}})
    coverage = {sid for offer in result for sid in offer["stationIds"]}
    assert coverage == set(stations), f"Lost Type2/CCS site coverage {sorted(set(stations)-coverage)[:10]}"
    assert stripped == 12, f"Unexpected unsupported CHAdeMO links: {stripped}"
    return {**offers,
            "policy":{**policy,"chademoOfferAssignmentsRemoved":stripped,
                      "permittedConnectorTypes":["Type 2","CCS"],
                      "siteIdentity":"exact_national_station_id",
                      "evseIdInference":False},
            "directOffers":result}


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("source")
    parser.add_argument("inventory")
    parser.add_argument("output",nargs="?")
    args=parser.parse_args()
    result=materialize(args.source,args.inventory)
    if args.output:
        p=Path(args.output);p.parent.mkdir(parents=True,exist_ok=True)
        p.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"directOfferGroups":len(result["directOffers"]),
      "coveredStations":len({s for o in result["directOffers"] for s in o["stationIds"]}),
      "removedCHAdeMO":result["policy"]["chademoOfferAssignmentsRemoved"]}))


if __name__ == "__main__":
    main()
