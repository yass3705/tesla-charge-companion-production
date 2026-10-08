#!/usr/bin/env python3
"""Convert every exact Electra OCPI tariff without dropping component types.

Each element is evaluated independently; only genuinely undecidable conditions
remain non-comparable, with the source record and reason retained.
"""
import json
import math
import pathlib
import re
import sys
from collections import Counter

DAYS = {
    "SUNDAY": 0, "MONDAY": 1, "TUESDAY": 2, "WEDNESDAY": 3,
    "THURSDAY": 4, "FRIDAY": 5, "SATURDAY": 6,
}

def _numeric(value):
    if value is None or value == "":
        return None
    try:
        n = float(value)
    except (ValueError, TypeError):
        return None
    return n if math.isfinite(n) and n >= 0 else None

def _days(value):
    if value is None:
        return None
    if not isinstance(value, list):
        return None
    result = []
    for v in value:
        key = str(v).upper()
        if key in DAYS:
            result.append(DAYS[key])
        elif str(v).isdigit() and 0 <= int(v) <= 6:
            result.append(int(v))
        else:
            return None
    return sorted(set(result))

def rule_from_element(element, *, currency="EUR", tariff_description=None):
    restrictions = element.get("restrictions") or {}
    start = restrictions.get("startTime") or restrictions.get("start_time") or "00:00"
    end = restrictions.get("endTime") or restrictions.get("end_time") or "24:00"
    days_raw = restrictions.get("dayOfWeek", restrictions.get("day_of_week"))
    days = _days(days_raw)
    problems = []
    if days_raw is not None and days is None:
        problems.append("unknown_day_of_week")
    rule = {
        "scope": "allDay" if start == "00:00" and end == "24:00" else "timeWindow",
        "start": start, "end": end, "billing": "mixed", "currency": currency,
        "pricePerKwh": None, "chargePerMinute": None,
        "connectionFee": None, "idlePerMinute": None,
        "days": days, "ocpiDurationBands": [],
    }
    for src, dest, factor in (
        ("minDuration", "minDurationMinutes", 1/60),
        ("maxDuration", "maxDurationMinutes", 1/60),
        ("minPower", "minPowerKw", 1),
        ("maxPower", "maxPowerKw", 1),
    ):
        raw = restrictions.get(src, restrictions.get(src[0].lower()+''.join('_'+c.lower() if c.isupper() else c for c in src[1:])))
        if raw is not None:
            number = _numeric(raw)
            if number is None:
                problems.append("invalid_restriction:"+src)
            else:
                rule[dest] = number * factor
    for src, dest in (
        ("startDate", "validFromDate"), ("endDate", "validThroughDate"),
    ):
        value = restrictions.get(src, restrictions.get(src[0].lower()+''.join('_'+c.lower() if c.isupper() else c for c in src[1:])))
        if value is not None:
            rule[dest] = str(value)[:10]
    known = {"startTime","start_time","endTime","end_time","dayOfWeek","day_of_week","startDate","start_date","endDate","end_date","minDuration","min_duration","maxDuration","max_duration","minPower","min_power","maxPower","max_power","minSoc","minSoC","minVehicleSoc","congestionStartSoc","congestionThresholdSoc","socThreshold"}
    for name, value in restrictions.items():
        if name not in known and value not in (None, "", [], {}):
            problems.append("unsupported_restriction:"+name)
    found = 0
    for component in element.get("priceComponents", element.get("price_components", [])) or []:
        kind = str(component.get("type") or "").upper()
        price = _numeric(component.get("price"))
        size = _numeric(component.get("stepSize", component.get("step_size")))
        if price is None:
            problems.append("invalid_component_price:"+kind)
            continue
        if kind == "ENERGY":
            rule["pricePerKwh"] = (rule["pricePerKwh"] or 0) + price
            if size and size > 0:
                if rule.get("energyStepWh") not in (None,size):
                    problems.append("conflicting_energy_rounding_steps")
                rule["energyStepWh"] = size
        elif kind == "TIME":
            rule["chargePerMinute"] = (rule["chargePerMinute"] or 0) + price / 60
            if size and size > 0:
                if rule.get("chargingTimeStepSeconds") not in (None,size):
                    problems.append("conflicting_time_rounding_steps")
                rule["chargingTimeStepSeconds"] = size
        elif kind == "FLAT":
            rule["connectionFee"] = (rule["connectionFee"] or 0) + price
        elif kind == "PARKING_TIME":
            rule["idlePerMinute"] = (rule["idlePerMinute"] or 0) + price / 60
            if size and size > 0:
                if rule.get("parkingTimeStepSeconds") not in (None,size):
                    problems.append("conflicting_parking_rounding_steps")
                rule["parkingTimeStepSeconds"] = size
        elif kind == "CONGESTION_TIME":
            # Electra eMSP GraphQL publishes CONGESTION_TIME without a universal
            # trigger description. The user-defined V9 default is 80% battery.
            # Explicit source evidence always wins; unknown prose is not guessed.
            candidates = (
                component.get("congestionThresholdSoc"),
                component.get("congestionStartSoc"),
                component.get("minVehicleSoc"),
                component.get("minSoc"),
                restrictions.get("congestionThresholdSoc"),
                restrictions.get("congestionStartSoc"),
                restrictions.get("minVehicleSoc"),
                restrictions.get("minSoc"),
                restrictions.get("minSoC"),
                element.get("congestionStartSoc"),
            )
            threshold = next((n for raw in candidates if (n := _numeric(raw)) is not None and n <= 100), None)
            descriptions = [str(value) for value in (
                component.get("description"), component.get("explanation"),
                element.get("description"), element.get("explanation"),
                tariff_description,
            ) if value]
            if threshold is None and descriptions:
                found_soc = [
                    float(match.group(1).replace(",", "."))
                    for description in descriptions
                    for match in re.finditer(r"(\\d{1,3}(?:[.,]\\d+)?)\\s*%", description)
                ]
                if len(set(found_soc)) == 1 and 0 <= found_soc[0] <= 100:
                    threshold = found_soc[0]
                else:
                    problems.append("congestion_policy_source_explanation_requires_review")
            if threshold is None:
                threshold = 80
            rule["congestionStartSoc"] = threshold
            rule["congestionThresholdSource"] = (
                "official" if any(x is not None for x in candidates) or descriptions and "congestion_policy_source_explanation_requires_review" not in problems else "default_soc80"
            )
            rule["congestionTimePerMinute"] = (rule.get("congestionTimePerMinute") or 0) + price / 60
            if size and size > 0:
                if rule.get("congestionTimeStepSeconds") not in (None, size):
                    problems.append("conflicting_congestion_rounding_steps")
                rule["congestionTimeStepSeconds"] = size
        else:
            problems.append("unsupported_component:"+kind)
            continue
        found += 1
    if found == 0:
        problems.append("no_supported_price_component")
    return rule, sorted(set(problems))

def main():
    source = pathlib.Path(sys.argv[1])
    output = pathlib.Path(sys.argv[2])
    payload = json.loads(source.read_text(encoding="utf-8"))
    pan_by_public = {}
    for row in payload.get("panMatches") or []:
        public_id = str(row.get("publicId") or "").strip()
        pan_id = str(row.get("panStationId") or "").strip()
        if public_id and pan_id:
            pan_by_public.setdefault(public_id, []).append(pan_id)
    offers, unresolved, skipped = [], [], 0
    types = Counter()
    for entry in payload.get("stations") or []:
        station = entry.get("station") or {}
        public_id = str(station.get("id") or "").strip()
        pan_ids = pan_by_public.get(public_id, [])
        if entry.get("status") != 200:
            unresolved.append({"stationId": public_id, "stationName": station.get("name"), "reason": "station_endpoint_unavailable"})
            continue
        tariffs = (entry.get("location") or {}).get("chargeTariffs") or []
        if not pan_ids and tariffs:
            unresolved.append({"stationId": public_id, "stationName": station.get("name"), "reason": "national_identity_missing", "tariffCount":len(tariffs)})
            continue
        for tariff in tariffs:
            tariff_id = str(tariff.get("chargeTariffId") or tariff.get("id") or "tariff")
            currency = str(tariff.get("currency") or "EUR").upper()
            elements = tariff.get("elements") or []
            groups, problems = [], []
            for i, element in enumerate(elements):
                rule, warnings = rule_from_element(element, currency=currency, tariff_description=tariff.get("description") or tariff.get("explanation"))
                groups.append({"kind": "ocpi-element:"+str(i), "rules": [rule]})
                problems.extend(warnings)
                for component in element.get("priceComponents", element.get("price_components", [])) or []:
                    types[str(component.get("type") or "UNKNOWN").upper()] += 1
            if not groups:
                problems.append("tariff_without_elements")
            problems = sorted(set(problems))
            for pan_id in pan_ids:
                offer_id=f"electra-direct-exact:{pan_id}:{tariff_id}"
                offer = {
                    "id":offer_id,"provider":"Electra","kind":"direct","offerKind":"direct",
                    "subscriptionId":None,"countries":["FR"],"currency":currency,
                    "stationIds":[pan_id,f"national:FR:{pan_id}",f"irve-station:{pan_id}"],
                    "pricing":{"type":"component_groups","componentGroups":groups},
                    "priority":135,
                    "metadata":{
                        "verified":not problems,
                        "identityMode":"exact_national_irve_station",
                        "source":"Electra exact France snapshot","publicLocationId":public_id,
                        "panStationId":pan_id,"stationName":station.get("name"),
                        "tariffId":tariff_id,
                        "incompletePricingReason":";".join(problems) if problems else None,
                        "unresolvedComponents":problems
                    }
                }
                offers.append(offer)
                if problems:
                    unresolved.append({"stationId":public_id, "panStationId":pan_id,"stationName":station.get("name"),"tariffId":tariff_id,"offerId":offer_id,"reason":";".join(problems)})
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps({
        "schemaVersion":2,
        "dataset":"electra-exact-france-direct-offers",
        "generatedAt":payload.get("generatedAt"),"country":"FR",
        "offers":offers,"directOffers":offers,
        "stats":{"offers":len(offers),
                 "skippedUnsupportedTariffs":skipped,
                 "offersWithUnsupportedComponents":sum(bool(o.get("metadata",{}).get("incompletePricingReason")) for o in offers),
                 "componentTypes":dict(types),"unresolvedSourceCases":len(unresolved)},
        "unresolvedCases":unresolved
    },ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"offers":len(offers),"componentTypes":dict(types),"unresolvedCases":len(unresolved)}))
if __name__ == "__main__":
    main()
