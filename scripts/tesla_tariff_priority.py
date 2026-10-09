#!/usr/bin/env python3
"""Select Tesla tariffs by Mac freshness and strictly newer station-level SuC observations."""

import copy
import json
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo
from pathlib import Path
from urllib.parse import unquote, urlparse


def _date(value):
    if not isinstance(value, str) or len(value) != 10:
        raise ValueError(f"Invalid country update date: {value!r}")
    return date.fromisoformat(value)


def _observation_date(value):
    """Use the station's observed date, never the catalogue download/check date."""
    if not isinstance(value, str) or not value:
        return None
    try:
        if len(value) == 10:
            return date.fromisoformat(value)
        observed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if observed.tzinfo is None:
            return None  # An unzoned timestamp cannot prove chronological freshness.
        return observed.astimezone(ZoneInfo("Europe/Paris")).date()
    except ValueError:
        return None


def _suc_date(row):
    if not row:
        return None
    # Last successful per-station observation; neither file generation nor download
    # proves that a particular station's tariff has been freshly observed.
    return _observation_date(row.get("sourceObservedAt") or
                             (row.get("sucTracker") or {}).get("lastSuccessfulAt"))


def _mac_date(row, country_updated):
    return country_updated or _observation_date(row.get("sourceObservedAt") or row.get("lastUpdated"))


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
            preferred = "Mac" if code == "MA" or (age is not None and age < 10) else "newer SuC Tracker only"
            decisions[code] = {"macUpdatedOn": updated.isoformat() if updated else None,
                               "ageCalendarDays": age, "preferredTariffSource": preferred,
                               "stations": 0, "macTariffs": 0, "sucTariffs": 0,
                               "missingSucFallbacks": 0,
                               "olderOrEqualSucFallbacks": 0,
                               "unknownSucDateFallbacks": 0,
                               "unknownMacDateFallbacks": 0,
                               "recentMacTariffs": 0}
        decision = decisions[code]
        updated = _date(decision["macUpdatedOn"]) if decision["macUpdatedOn"] else None
        age = decision["ageCalendarDays"]
        decision["stations"] += 1
        if code == "MA" or (age is not None and age < 10):
            decision["macTariffs"] += 1
            decision["recentMacTariffs"] += 1
            continue
        mac_updated = _mac_date(row, updated)
        if mac_updated is None:
            decision["macTariffs"] += 1
            decision["unknownMacDateFallbacks"] += 1
            continue
        if (today - mac_updated).days < 10:
            decision["macTariffs"] += 1
            decision["recentMacTariffs"] += 1
            continue
        match = suc.get(_tesla_key(row))
        price = match.get("pricing") if match and match.get("countryCode") == code else None
        if not isinstance(price, dict) or not price.get("rules"):
            decision["macTariffs"] += 1
            decision["missingSucFallbacks"] += 1
            continue
        observed = _suc_date(match)
        if observed is None or observed > today:
            decision["macTariffs"] += 1
            decision["unknownSucDateFallbacks"] += 1
            continue
        if observed <= mac_updated:
            decision["macTariffs"] += 1
            decision["olderOrEqualSucFallbacks"] += 1
            continue
        row["pricing"] = copy.deepcopy(price)
        for cfg in row.get("chargingConfigurations") or []:
            cfg["pricing"] = copy.deepcopy(price)
        decision["sucTariffs"] += 1
    report = {"schemaVersion": 1, "asOfDate": as_of_date,
              "policy": "MA always Mac; else Mac for age 0-9 calendar days. From day 10 SuC only when matched station observation is strictly newer than Mac; otherwise Mac.",
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
