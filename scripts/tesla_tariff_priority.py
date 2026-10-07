#!/usr/bin/env python3
"""Select Tesla tariffs using country-specific Mac dates and a pinned SuC catalogue."""

import copy
import json
from datetime import date
from pathlib import Path
from urllib.parse import unquote, urlparse


def _date(value):
    if not isinstance(value, str) or len(value) != 10:
        raise ValueError(f"Invalid country update date: {value!r}")
    return date.fromisoformat(value)


def _stations(rows, label):
    if not isinstance(rows, list) or not rows:
        raise ValueError(f"Empty {label} catalogue")
    ids = [row.get("id") for row in rows]
    if any(not value for value in ids) or len(ids) != len(set(ids)):
        raise ValueError(f"Missing or duplicate {label} station ID")
    return {row["id"]: row for row in rows}


def _tesla_key(row):
    source_id = (row.get("sucTracker") or {}).get("sourceStationId")
    if not source_id:
        path = urlparse(row.get("teslaUrl") or "").path
        marker = "/supercharger/"
        source_id = unquote(path.split(marker, 1)[1]).strip("/") if marker in path else row["id"]
    return row["countryCode"], str(source_id).casefold()


def select_tariffs(mac_rows, suc_rows, country_updates, as_of_date):
    """Keep Mac station inventory; replace only matched tariff fields when SuC wins."""
    today = _date(as_of_date)
    if country_updates.get("schemaVersion") != 1 or country_updates.get("timeZone") != "Europe/Paris":
        raise ValueError("Invalid Mac country update metadata")
    updates = country_updates.get("countries")
    if not isinstance(updates, dict):
        raise ValueError("Missing country-scoped Mac update dates")
    _stations(mac_rows, "Mac")
    _stations(suc_rows, "SuC")
    suc = {_tesla_key(row): row for row in suc_rows}
    if len(suc) != len(suc_rows):
        raise ValueError("Ambiguous SuC Tesla location IDs")
    selected = copy.deepcopy(mac_rows)
    decisions = {}
    for row in selected:
        code = row.get("countryCode")
        if not isinstance(code, str) or len(code) != 2:
            raise ValueError("Invalid Mac country code")
        if code not in decisions:
            meta = updates.get(code)
            updated = _date(meta["updatedOn"]) if isinstance(meta, dict) and "updatedOn" in meta else None
            age = (today - updated).days if updated else None
            if age is not None and age < 0:
                raise ValueError(f"Future Mac update date for {code}")
            preferred = "Mac" if code == "MA" or (age is not None and age < 10) else "SuC Tracker"
            decisions[code] = {"macUpdatedOn": updated.isoformat() if updated else None,
                               "ageCalendarDays": age, "preferredTariffSource": preferred,
                               "stations": 0, "macTariffs": 0, "sucTariffs": 0,
                               "missingSucFallbacks": 0}
        decision = decisions[code]
        decision["stations"] += 1
        if decision["preferredTariffSource"] == "Mac":
            decision["macTariffs"] += 1
            continue
        match = suc.get(_tesla_key(row))
        price = match.get("pricing") if match and match.get("countryCode") == code else None
        if not isinstance(price, dict) or not price.get("rules"):
            decision["macTariffs"] += 1
            decision["missingSucFallbacks"] += 1
            continue
        row["pricing"] = copy.deepcopy(price)
        for cfg in row.get("chargingConfigurations") or []:
            cfg["pricing"] = copy.deepcopy(price)
        decision["sucTariffs"] += 1
    report = {"schemaVersion": 1, "asOfDate": as_of_date,
              "policy": "MA always Mac; elsewhere Mac for age 0-9 calendar days, SuC from day 10",
              "countries": decisions}
    return selected, report


def build_selected_catalogue(mac_path, suc_path, updates_path, as_of_date, output_path, report_path):
    def read(path):
        return json.loads(Path(path).read_text(encoding="utf-8"))
    selected, report = select_tariffs(read(mac_path), read(suc_path), read(updates_path), as_of_date)
    for path, value in ((output_path, selected), (report_path, report)):
        target = Path(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return report
