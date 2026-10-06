#!/usr/bin/env python3
"""Weekday-aware Electra app tariff conversion stays complete and unambiguous."""
import datetime as dt
import importlib.util
import pathlib
from zoneinfo import ZoneInfo

path = pathlib.Path(__file__).resolve().parents[1] / "scripts/build_electra_direct_offers.py"
spec = importlib.util.spec_from_file_location("electra_direct", path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
energy = lambda days, start, end, price: {
    "restrictions": {"dayOfWeek": days, "startTime": start, "endTime": end},
    "priceComponents": [{"type": "ENERGY", "price": price}],
}
tariff = {
    "currency": "EUR", "currentPricePerKwh": 0.49,
    "elements": [
        energy(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY"], "00:00", "05:00", 0.39),
        energy(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY"], "05:00", "19:00", 0.61),
        energy(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY"], "19:00", "00:00", 0.49),
        energy(["FRIDAY", "SATURDAY"], "03:00", "19:00", 0.61),
        energy(["FRIDAY", "SATURDAY"], "19:00", "03:00", 0.49),
        energy(["SUNDAY"], "00:00", "05:00", 0.39),
        energy(["SUNDAY"], "05:00", "20:00", 0.61),
        energy(["SUNDAY"], "20:00", "00:00", 0.49),
        {"restrictions": {"dayOfWeek": [], "startTime": None, "endTime": None},
         "priceComponents": [{"type": "CONGESTION_TIME", "price": 24}]},
    ],
}
captured = dt.datetime(2026, 10, 6, 19, 53, tzinfo=ZoneInfo("Europe/Paris"))
rules, congestion = module.energy_rules(tariff, captured)
assert congestion == [24]
def price(day, minute):
    matching = [rule for rule in rules
                if (not rule.get("daysOfWeek") or day in rule["daysOfWeek"])
                and module.minute(rule["start"], 0) <= minute < module.minute(rule["end"], 1440)]
    assert len(matching) == 1, (day, minute, matching)
    return matching[0]["pricePerKwh"]
assert price(2, 22 * 60) == 0.49
assert price(5, 1 * 60) == 0.49
assert price(0, 1 * 60) == 0.39
assert price(0, 21 * 60) == 0.49
for day in range(7):
    for minute in range(1440):
        price(day, minute)
print("Electra weekday direct tariff: complete 7-day schedule and local current price verified")
