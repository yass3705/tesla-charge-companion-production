#!/usr/bin/env python3
"""Build exact Electra app energy offers from the pinned first-party capture."""
import argparse
import collections
import copy
import datetime as dt
import json
import pathlib
from zoneinfo import ZoneInfo

TIME_ZONE = "Europe/Paris"
MAX_PAN_DISTANCE_M = 10
ACTIVE_PAN_OVERRIDES = {
    # The current official page lists 19 DC connectors, all represented by
    # this PAN row. The other two PAN rows are an old AC row and duplicate DC.
    "0a650b39-b871-4e78-9670-e56e6b20f329": ["FRELCP12954082"],
}


def minute(value, fallback):
    if value is None:
        return fallback
    if not isinstance(value, str) or len(value) != 5 or value[2] != ":":
        raise ValueError(f"invalid local tariff time: {value!r}")
    hour, minute_value = int(value[:2]), int(value[3:])
    if hour > 24 or minute_value > 59 or (hour == 24 and minute_value):
        raise ValueError(f"invalid local tariff time: {value!r}")
    return hour * 60 + minute_value


def hhmm(value):
    return f"{value // 60:02d}:{value % 60:02d}"


WEEKDAYS = {"SUNDAY": 0, "MONDAY": 1, "TUESDAY": 2, "WEDNESDAY": 3, "THURSDAY": 4, "FRIDAY": 5, "SATURDAY": 6}


def energy_rules(tariff, capture_local):
    if tariff.get("currency") != "EUR":
        raise ValueError("unsupported currency")
    rates = [[None] * 1440 for _ in range(7)]
    congestion = []
    for element in tariff.get("elements", []):
        restrictions = element.get("restrictions") or {}
        components = element.get("priceComponents") or []
        if len(components) != 1:
            raise ValueError("compound tariff element")
        component = components[0]
        if component.get("type") == "CONGESTION_TIME":
            congestion.append(component.get("price"))
            continue
        if component.get("type") != "ENERGY":
            raise ValueError("unsupported tariff component")
        price = component.get("price")
        if not isinstance(price, (int, float)) or not 0 < price < 2:
            raise ValueError("invalid energy price")
        raw_days = restrictions.get("dayOfWeek") or []
        if not isinstance(raw_days, list) or any(day not in WEEKDAYS for day in raw_days):
            raise ValueError("unsupported Electra weekday restriction")
        days = {WEEKDAYS[day] for day in raw_days} if raw_days else set(range(7))
        start = minute(restrictions.get("startTime"), 0)
        end = minute(restrictions.get("endTime"), 1440)
        if start == end:
            covered = range(1440)
        elif end > start:
            covered = range(start, end)
        else:
            covered = list(range(start, 1440)) + list(range(end))
        for day in days:
            for index in covered:
                if rates[day][index] is not None:
                    raise ValueError("overlapping energy windows")
                rates[day][index] = price
    if not congestion or any(rate is None for day in rates for rate in day):
        raise ValueError("missing congestion component or incomplete energy week")
    captured_rate = tariff.get("currentPricePerKwh")
    capture_day = (capture_local.weekday() + 1) % 7
    if rates[capture_day][capture_local.hour * 60 + capture_local.minute] != captured_rate:
        raise ValueError("current price disagrees with local tariff window")
    grouped = collections.defaultdict(set)
    for day, daily_rates in enumerate(rates):
        start = 0
        for index in range(1, 1441):
            if index == 1440 or daily_rates[index] != daily_rates[start]:
                grouped[(start, index, daily_rates[start])].add(day)
                start = index
    rules = []
    for (start, end, price), days in sorted(grouped.items()):
        rule = {
            "scope": "timeWindow",
            "start": hhmm(start),
            "end": hhmm(end),
            "billing": "kwh",
            "currency": "EUR",
            "pricePerKwh": price,
        }
        if len(days) != 7:
            rule["daysOfWeek"] = sorted(days)
        rules.append(rule)
    return rules, congestion


def build(payload):
    captured_at = payload["generatedAt"]
    capture_local = dt.datetime.fromisoformat(captured_at).astimezone(ZoneInfo(TIME_ZONE))
    pan_matches = collections.defaultdict(list)
    for match in payload["panMatches"]:
        if match["distanceM"] <= MAX_PAN_DISTANCE_M:
            pan_matches[match["publicId"]].append(match["panStationId"])
    date_label = capture_local.strftime("%d/%m/%Y")
    offers, skipped = [], []
    for entry in payload["stations"]:
        station = entry["station"]
        tariffs = entry.get("location", {}).get("chargeTariffs") or []
        candidate = [
            tariff for tariff in tariffs
            if any(component.get("type") == "CONGESTION_TIME"
                   for element in tariff.get("elements", [])
                   for component in element.get("priceComponents", []))
        ]
        station_ids = sorted(set(pan_matches[station["id"]]))
        if station["id"] in ACTIVE_PAN_OVERRIDES:
            preferred = ACTIVE_PAN_OVERRIDES[station["id"]]
            if not set(preferred).issubset(station_ids):
                raise ValueError("verified Electra PAN override lost its exact match")
            station_ids = preferred
        if len(candidate) != 1 or not station_ids:
            skipped.append({"station": station["name"], "reason": "ambiguous_direct_tariff" if len(candidate) != 1 else "no_close_pan_match"})
            continue
        tariff = candidate[0]
        try:
            rules, congestion = energy_rules(tariff, capture_local)
        except ValueError as error:
            skipped.append({"station": station["name"], "reason": str(error)})
            continue
        offers.append({
            "id": f"electra-app-{station['id']}",
            "provider": f"Electra direct · énergie seule · relevé {date_label}",
            "operatorAliases": ["Electra"],
            "directOperatorOnly": True,
            "stationIds": station_ids,
            "connectorKinds": ["DC"],
            "countries": ["FR"],
            "currency": "EUR",
            "priority": 125,
            "pricing": {
                "type": "rules",
                "priceSelectionBasis": "session_start_local_time",
                "postChargeFeeUnknown": True,
                "rules": rules,
            },
            "source": payload["sources"]["publicGraphql"],
            "metadata": {
                "verifiedScope": "exact_station",
                "officialStationId": station["id"],
                "stationName": station["name"],
                "timeZone": TIME_ZONE,
                "capturedAt": captured_at,
                "sourceTariffId": tariff["chargeTariffId"],
                "sourceReport": "data/operator_direct/electra_exact_france.json",
                "energyOnly": True,
                "conditionalCongestionFeeExcluded": True,
                "congestionSourcePrices": congestion,
            },
        })
    if len(offers) < 400:
        raise ValueError(f"Electra exact tariff coverage regressed: {len(offers)} offers; rejected={dict(collections.Counter(row['reason'] for row in skipped))}")
    subscriptions = []
    for direct in offers:
        for plan_id, name, discount, monthly_fee in (
            ("electra-plus-essential", "Electra+ Essential", 0.10, 1.99),
            ("electra-plus-smart", "Electra+ Smart", 0.20, 4.99),
        ):
            member = copy.deepcopy(direct)
            member["id"] = f"{direct['id']}:{plan_id}"
            member["provider"] = name
            member["offerKind"] = "subscription"
            member["subscriptionId"] = plan_id
            member["selectionId"] = plan_id
            member["monthlyFeeEur"] = monthly_fee
            member["metadata"].update({
                "subscriptionName": name,
                "monthlyFeeEur": monthly_fee,
                "energyDiscountEurPerKwh": discount,
                "subscriptionSource": "https://www.go-electra.com/fr/electra-plus/",
                "subscriptionAppliesTo": "Electra-operated DC stations with a verified Electra app base rate",
                "monthlyFeeExcludedFromSessionTotal": True,
            })
            for rule in member["pricing"]["rules"]:
                rule["pricePerKwh"] = round(rule["pricePerKwh"] - discount, 6)
                if rule["pricePerKwh"] < 0:
                    raise ValueError("Electra+ discount exceeds verified base rate")
            subscriptions.append(member)
    return {
        "schemaVersion": 1,
        "country": "FR",
        "generatedAt": captured_at,
        "mode": "exact_station_app_energy_tariffs",
        "coverage": {
            "capturedOfficialStations": len(payload["stations"]),
            "rankableOfficialStations": len(offers),
            "matchedPanStationIds": len({station_id for offer in offers for station_id in offer["stationIds"]}),
        },
        "policy": {
            "exactStationIdsOnly": True,
            "maxPanMatchDistanceM": MAX_PAN_DISTANCE_M,
            "dcConnectorsOnly": True,
            "priceSelectionBasis": "session_start_local_time",
            "energyOnly": True,
            "conditionalCongestionFeeExcluded": True,
            "skipped": skipped,
        },
        "directOffers": offers,
        "subscriptionOffers": subscriptions,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=pathlib.Path)
    parser.add_argument("output", type=pathlib.Path)
    args = parser.parse_args()
    result = build(json.loads(args.input.read_text(encoding="utf-8")))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(json.dumps({"directOffers": len(result["directOffers"]), "skipped": result["policy"]["skipped"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
