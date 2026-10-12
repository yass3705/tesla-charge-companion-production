#!/usr/bin/env python3
"""Compile audited UK direct sources into the pinned open-feed snapshot.

The source files are copied from the exact Data Lab commit by build_snapshot.py.
Every tariff is attached to one connector; unsupported or missing prices fail.
"""
import copy
import gzip
import hashlib
import html
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse


EXPECTED = {
    "Be.EV": (600, 2539, 2539),
    "Applegreen Fast Charge": (261, 534, 534),
    "Wenea": (209, 630, 630),
    "IONITY": (83, 872, 872),
    "Zest": (1987, 3469, 2797),
    "RAW Charging": (250, 500, 0),
    "JOLT": (71, 155, 0),
    "3ti Energy Hubs": (7, 78, 0),
    "Shell Recharge": (32, 206, 0),
    "TotalEnergies": (1439, 3263, 0),
    "Qwello": (96, 359, 0),
    "Osprey Charging": (407, 0, 0),
    "Fastned": (42, 0, 0),
    "Roam": (401, 0, 0),
    "Lidl": (313, 0, 0),
    "Charge My Street": (106, 0, 0),
    "Believ": (854, 0, 0),
    "Monta": (1389, 1389, 0),
    "ParkRecharge": (443, 811, 0),
    "GeniePoint": (306, 1138, 281),
}


def read(path):
    with gzip.open(path, "rt", encoding="utf-8") as handle:
        return json.load(handle)


def money(value):
    amount = float(value)
    if not 0 <= amount <= 3:
        raise ValueError(f"invalid UK direct price: {value}")
    return amount


def tariff(identifier, price):
    return {
        "id": identifier,
        "currency": "GBP",
        "elements": [{"price_components": [{"type": "ENERGY", "price": money(price), "step_size": 1}]}],
    }


def source(name, party, locations, tariffs, filename, blob):
    count = sum(len(evse.get("connectors", [])) for loc in locations for evse in loc.get("evses", []))
    if (len(locations), count, len(tariffs)) != EXPECTED[name]:
        raise AssertionError(f"{name}: count drift: {len(locations)} locations / {count} connectors / {len(tariffs)} tariffs")
    ids = {t["id"] for t in tariffs}
    if len(ids) != len(tariffs):
        raise AssertionError(f"{name}: duplicate tariff identity")
    station_ids = [loc["id"] for loc in locations]
    if len(set(station_ids)) != len(station_ids):
        raise AssertionError(f"{name}: duplicate station identity")
    for loc in locations:
        if loc.get("country_code") != "GB" or loc.get("publish") is not True:
            raise AssertionError(f"{name}: non-public/outside-GB location")
        lat, lon = loc["coordinates"]["latitude"], loc["coordinates"]["longitude"]
        if not (49 <= float(lat) <= 61 and -9 <= float(lon) <= 3):
            raise AssertionError(f"{name}: invalid GB coordinates")
        for evse in loc["evses"]:
            if not (evse.get("evse_id") or evse.get("uid")):
                raise AssertionError(f"{name}: missing EVSE identity")
            for connector in evse["connectors"]:
                references = connector.get("tariff_ids", [])
                if not connector.get("id") or len(references) > 1 or (references and references[0] not in ids):
                    raise AssertionError(f"{name}: missing exact tariff reference")
                power = connector.get("max_electric_power")
                if (tariffs or power is not None) and (not isinstance(power, (int, float)) or power <= 0):
                    raise AssertionError(f"{name}: missing connector power")
    return {
        "name": name,
        "partyIdsExpected": [party],
        "pricingScope": "exact_connector_direct" if tariffs else "inventory_only_tariff_unverified",
        "sourceAudit": {"sourceFile": filename, "sourceSha256": hashlib.sha256(blob).hexdigest()},
        "summary": {"locations": len(locations), "connectors": count, "tariffs": len(tariffs), "status": "inventory_only_tariff_unverified" if not tariffs else ("complete" if len(tariffs) == count else "complete_with_fail_closed_residual")},
        "locations": locations,
        "tariffs": tariffs,
    }


def beev(data, filename, blob):
    locations, tariffs = [], []
    for site in data["sites"]:
        if site.get("isBeevOperated") is not True:
            raise AssertionError("Be.EV: non-operated site")
        evses = []
        for point in site["chargePoints"]:
            price = point["tariff"]
            if price.get("currency") != "GBP":
                raise AssertionError("Be.EV: non-GBP tariff")
            connectors = []
            for connector in point["connectors"]:
                raw_id = str(connector["connectorId"])
                exact_id = raw_id if len(raw_id) == 36 and raw_id.count("-") == 4 else str(connector.get("physicalReference") or "")
                if not exact_id:
                    raise AssertionError("Be.EV: connector lacks unique source identity")
                cid = str(site["siteId"]) + ":" + str(point["chargePointId"]) + ":" + exact_id
                tid = "beev:" + cid
                tariffs.append(tariff(tid, price["amount"]))
                connectors.append({
                    "id": cid, "standard": str(connector.get("plugType", "UNKNOWN")),
                    "power_type": "UNKNOWN", "max_electric_power": round(float(connector["powerOutput"]) * 1000),
                    "tariff_ids": [tid],
                })
            evses.append({"evse_id": "GB*BEV*E" + str(point["chargePointId"]), "status": "UNKNOWN", "connectors": connectors})
        coord = site["coordinates"]
        locations.append({
            "id": str(site["siteId"]), "country_code": "GB", "party_id": "BEV", "publish": True,
            "name": site["name"], "address": site.get("formattedAddress", ""),
            "coordinates": {"latitude": coord["lat"], "longitude": coord["long"]},
            "operator": {"name": "Be.EV"}, "evses": evses,
        })
    return source("Be.EV", "BEV", locations, tariffs, filename, blob)


def applegreen(data, filename, blob):
    locations, tariffs = [], []
    for station in data["stations"]:
        if station.get("deleted") or station.get("stationAccessLevelId") != "PUBLIC":
            raise AssertionError("Applegreen: non-public station")
        evses = []
        for socket in station["stationSockets"]:
            prices = [p for p in socket.get("socketPrices", []) if p.get("billingPlanCode") == "Guest_Plan" and not p.get("deleted")]
            if len(prices) != 1 or prices[0].get("currency") != "GBP" or prices[0].get("transactionFee") != 0:
                raise AssertionError("Applegreen: ambiguous guest price or extra fee")
            cid = str(socket["id"])
            tid = "applegreen:" + cid
            tariffs.append(tariff(tid, prices[0]["kwhPrice"]))
            power = float(socket["maximumPower"])
            evses.append({
                "evse_id": "GB*AGF*E" + str(station["id"]) + ":" + cid,
                "status": str(socket.get("socketStatusId", "UNKNOWN")),
                "connectors": [{
                    "id": cid, "standard": str(socket.get("stationModelSocketSocketTypeId", "UNKNOWN")),
                    "power_type": str(socket.get("stationModelSocketVoltageType", "UNKNOWN")),
                    "max_electric_power": round(power * 1000), "tariff_ids": [tid],
                }],
            })
        locations.append({
            "id": str(station["id"]), "country_code": "GB", "party_id": "AGF", "publish": True,
            "name": station.get("caption") or station.get("siteDisplayName") or "Applegreen",
            "address": station.get("addressAddress1", ""), "city": station.get("addressCity", ""),
            "postal_code": station.get("addressZipCode", ""),
            "coordinates": {"latitude": station["latitude"], "longitude": station["longitude"]},
            "operator": {"name": "Applegreen Fast Charge"}, "evses": evses,
        })
    return source("Applegreen Fast Charge", "AGF", locations, tariffs, filename, blob)


def wenea(data, filename, blob):
    locations = copy.deepcopy(data["locations"])
    tariffs = []
    seen = set()
    duplicate_count = 0
    for loc in locations:
        loc["country_code"], loc["party_id"], loc["publish"] = "GB", "WNE", True
        for evse in loc["evses"]:
            kept = []
            for connector in evse["connectors"]:
                exact_key = (loc["id"], connector["id"])
                if exact_key in seen:
                    duplicate_count += 1
                    continue
                seen.add(exact_key)
                direct = connector.get("tcc_direct_price") or {}
                if direct.get("currency") != "GBP" or direct.get("unit") != "kWh" or not direct.get("source"):
                    raise AssertionError("Wenea: missing official connector price")
                tid = "wenea:" + str(connector["id"])
                connector["tariff_ids"] = [tid]
                tariffs.append(tariff(tid, direct["amount"]))
                kept.append(connector)
            evse["connectors"] = kept
        loc["evses"] = [evse for evse in loc["evses"] if evse["connectors"]]
    empty_locations = [loc for loc in locations if not loc["evses"]]
    test_id = "94846a98-ff9d-0db8-9c0f-7eb9de8518a2"
    locations = [loc for loc in locations if loc["id"] != test_id]
    if duplicate_count != 1:
        raise AssertionError(f"Wenea: unexpected duplicate connector count {duplicate_count}")
    if len(empty_locations) != 3 or test_id not in {loc["id"] for loc in empty_locations}:
        raise AssertionError("Wenea: empty/test location quarantine drift")
    result = source("Wenea", "WNE", locations, tariffs, filename, blob)
    result["sourceAudit"]["excludedDuplicateConnectors"] = duplicate_count
    result["sourceAudit"]["excludedEmptyTestLocations"] = 1
    result["sourceAudit"]["retainedEmptyPublicLocations"] = len(empty_locations) - 1
    return result


def ionity(data, filename, blob):
    locations, tariffs = [], []
    for station in data["locations"]:
        if station.get("country") != "GB" or station.get("cpoIdentifier") != "IONITY_CPO":
            raise AssertionError("IONITY: non-UK/non-operated station")
        evses = []
        for connector in station["connectors"]:
            cid = str(connector["uuid"])
            if not cid or not connector.get("pricePerKwhGbp"):
                raise AssertionError("IONITY: missing exact connector/price")
            tid = "ionity-uk:" + cid
            tariffs.append(tariff(tid, connector["pricePerKwhGbp"]))
            evses.append({
                "evse_id": str(connector.get("sourceEvseId") or "GB*ION*E" + cid),
                "status": "UNKNOWN",
                "connectors": [{
                    "id": cid, "standard": str(connector.get("type") or "UNKNOWN"),
                    "power_type": str(connector.get("kind") or "UNKNOWN"),
                    "max_electric_power": round(float(connector["powerKw"]) * 1000),
                    "tariff_ids": [tid],
                }],
            })
        locations.append({
            "id": str(station["uuid"]), "country_code": "GB", "party_id": "ION", "publish": True,
            "name": station["name"], "address": station.get("address", ""),
            "city": station.get("city", ""), "postal_code": station.get("postalCode", ""),
            "coordinates": {"latitude": station["latitude"], "longitude": station["longitude"]},
            "operator": {"name": "IONITY"}, "evses": evses,
        })
    return source("IONITY", "ION", locations, tariffs, filename, blob)


def zest(data, filename, blob):
    locations, tariffs = [], []
    for station in data["data"]["locations"]:
        if station.get("public") is not True:
            raise AssertionError("Zest: non-public location")
        evses = []
        for point in station["chargePoints"]:
            for raw in point["evses"]:
                eid = str(raw["id"])
                connectors = []
                for index, connector in enumerate(raw["connectors"]):
                    cid = "zest:" + eid + ":" + str(index)
                    flat = raw.get("pricePerKwh")
                    day = raw.get("dayPricePerKwh")
                    night = raw.get("nightPricePerKwh")
                    idle = raw.get("idleFeePerMinute")
                    refs = []
                    if flat is not None and day is None and night is None and idle is not None:
                        tid = "zest:" + eid
                        next_tariff = tariff(tid, flat)
                        if idle:
                            next_tariff["elements"][0]["price_components"].append({
                                "type": "PARKING_TIME", "price": money(float(idle) * 60), "step_size": 60,
                            })
                        tariffs.append(next_tariff)
                        refs = [tid]
                    connectors.append({
                        "id": cid, "standard": str(connector.get("type") or "UNKNOWN"),
                        "power_type": str(raw.get("currentType") or "UNKNOWN").upper(),
                        "max_electric_power": raw["maxPower"], "tariff_ids": refs,
                    })
                evses.append({"evse_id": "GB*ZES*E" + eid, "status": str(raw.get("status") or "UNKNOWN"), "connectors": connectors})
        pos = station["geoPosition"]
        locations.append({
            "id": str(station["id"]), "country_code": "GB", "party_id": "ZES", "publish": True,
            "name": station["name"], "postal_code": station.get("postCode", ""),
            "coordinates": {"latitude": pos["latitude"], "longitude": pos["longitude"]},
            "operator": {"name": "Zest"}, "evses": evses,
        })
    result = source("Zest", "ZES", locations, tariffs, filename, blob)
    result["sourceAudit"]["unpricedDayNightIdleWindow"] = 642
    result["sourceAudit"]["unpricedAbsentPrice"] = 31
    return result


def inventory_only_ocpi(data, filename, blob, name, party):
    locations = copy.deepcopy(data["locations"])
    for loc in locations:
        if loc.get("country_code") not in (None, "GB") or loc.get("country") not in (None, "GBR", "United Kingdom"):
            raise AssertionError(f"{name}: outside-GB location")
        if loc.get("publish") is False:
            raise AssertionError(f"{name}: non-public location")
        loc["country_code"], loc["party_id"], loc["publish"] = "GB", party, True
        if name == "JOLT":
            loc["id"] = "jolt:" + str(loc["evses"][0].get("evse_id") or loc["evses"][0].get("uid"))
        loc["operator"] = {"name": name}
        for evse in loc["evses"]:
            for connector in evse.get("connectors", []):
                connector["tariff_ids"] = []
    result = source(name, party, locations, [], filename, blob)
    reasons = {
        "RAW Charging": "OCPI VAT field and consumer gross price not independently reconciled",
        "JOLT": "station prices absent in PCPR; first 7 kWh, session fee and minimum depend on payment channel",
        "3ti Energy Hubs": "OCPI min_kwh restriction and VAT basis not supported by current runtime",
    }
    result["sourceAudit"]["tariffQuarantineReason"] = reasons[name]
    return result


def raw(data, filename, blob):
    return inventory_only_ocpi(data, filename, blob, "RAW Charging", "CPIE")


def jolt(data, filename, blob):
    return inventory_only_ocpi(data, filename, blob, "JOLT", "JLT")


def energy_hubs(data, filename, blob):
    return inventory_only_ocpi(data, filename, blob, "3ti Energy Hubs", "3TI")


def shell_recharge(data, filename, blob):
    locations, unknown_power = [], 0
    for raw in data["locations"]:
        if raw.get("operatorId") != "GB*TNM":
            continue
        if (raw.get("accessibility") or {}).get("status") != "FreePublic":
            raise AssertionError("Shell Recharge: non-public direct-CPO location")
        evses = []
        for evse in raw["evses"]:
            connectors = []
            for connector in evse["connectors"]:
                electrical = connector["electricalProperties"]
                kw = float(electrical["maxElectricPower"])
                if kw < 2:
                    power = None
                    unknown_power += 1
                else:
                    power = round(kw * 1000)
                connectors.append({
                    "id": str(connector["uid"]), "standard": str(connector.get("connectorType") or "UNKNOWN"),
                    "power_type": str(electrical.get("powerType") or "UNKNOWN"),
                    "max_electric_power": power, "tariff_ids": [],
                })
            evses.append({"evse_id": str(evse["evseId"]), "status": str(evse.get("status") or "UNKNOWN"), "connectors": connectors})
        address = raw["address"]
        locations.append({
            "id": str(raw["uid"]), "country_code": "GB", "party_id": "TNM", "publish": True,
            "name": str(raw.get("subOperatorName") or "Shell Recharge"),
            "address": address.get("streetAndNumber", ""), "city": address.get("city", ""),
            "postal_code": address.get("postalCode", ""), "coordinates": raw["coordinates"],
            "operator": {"name": "Shell Recharge"}, "evses": evses,
        })
    if unknown_power != 18:
        raise AssertionError("Shell Recharge: suspect low-power count drift")
    result = source("Shell Recharge", "TNM", locations, [], filename, blob)
    result["sourceAudit"]["unknownPowerConnectors"] = unknown_power
    result["sourceAudit"]["tariffQuarantineReason"] = "Shell_RP_2 units/VAT not reconciled with gross guest price"
    return result


def totalenergies(data, filename, blob):
    locations = []
    for raw in data["locations"]:
        if raw.get("networkId") != "GB*BPL" or raw.get("cpoVendorId") != "SLMS":
            continue
        evses = []
        for point in raw["chargePoints"]:
            connectors = []
            for connector in point["connectors"]:
                connectors.append({
                    "id": str(connector["id"]), "standard": str(connector.get("standard") or "UNKNOWN"),
                    "power_type": str(connector.get("powerType") or "UNKNOWN"),
                    "max_electric_power": round(float(connector["power"]) * 1000),
                    "tariff_ids": [],
                })
            evses.append({"evse_id": str(point["id"]), "status": str(point.get("status") or "UNKNOWN"), "connectors": connectors})
        locations.append({
            "id": str(raw["id"]), "country_code": "GB", "party_id": "BPL", "publish": True,
            "name": "TotalEnergies Source London", "address": raw.get("address", ""),
            "city": raw.get("city", ""), "postal_code": raw.get("postalCode", ""),
            "coordinates": {"latitude": raw["latitude"], "longitude": raw["longitude"]},
            "operator": {"name": "TotalEnergies"}, "evses": evses,
        })
    result = source("TotalEnergies", "BPL", locations, [], filename, blob)
    result["sourceAudit"]["tariffQuarantineReason"] = "official PAYG has local time windows, idle/parking fees, minimum energy and dated site promotions; current compiler cannot quote full session cost"
    return result


def qwello(data, filename, blob):
    groups = {}
    for row in data["records"]:
        view, raw = row["sourceTariffView"], row["publicEvse"]
        if view.get("country") != "GBR" or view.get("currency") != "GBP":
            raise AssertionError("Qwello: outside-GB/non-GBP tariff view")
        ids = tuple(sorted(str(value) for value in view["id"]))
        if str(raw["evseId"]) not in ids:
            raise AssertionError("Qwello: EVSE missing from tariff-view station")
        group = groups.setdefault(ids, {"view": view, "rows": []})
        group["rows"].append(raw)
    locations = []
    for ids, group in groups.items():
        view, first = group["view"], group["rows"][0]
        evses = []
        for raw in group["rows"]:
            connectors = [{
                "id": str(connector["uuid"]),
                "standard": str(connector.get("connectorStandard") or "UNKNOWN"),
                "power_type": "UNKNOWN", "max_electric_power": None, "tariff_ids": [],
            } for connector in raw["connectors"]]
            evses.append({"evse_id": str(raw["evseId"]), "status": "AVAILABLE" if str(raw.get("status")).endswith("_AVAILABLE") else "UNKNOWN", "connectors": connectors})
        address = first.get("address") or {}
        locations.append({
            "id": "qwello:" + ids[0], "country_code": "GB", "party_id": "QWC", "publish": True,
            "name": view.get("location") or "Qwello", "address": address.get("street", ""),
            "city": view.get("city", ""), "postal_code": address.get("zipcode", ""),
            "coordinates": {"latitude": first["latitude"], "longitude": first["longitude"]},
            "operator": {"name": "Qwello"}, "evses": evses,
        })
    result = source("Qwello", "QWC", locations, [], filename, blob)
    result["sourceAudit"]["tariffQuarantineReason"] = "minute charges, day/night windows, caps and reservation fee require a complete supported pricing model"
    result["sourceAudit"]["unknownPowerConnectors"] = 359
    return result


def station_only_row(identifier, name, lat, lon, party, provider, address="", postal_code=""):
    return {
        "id": str(identifier), "country_code": "GB", "party_id": party, "publish": True,
        "name": str(name), "address": str(address), "postal_code": str(postal_code),
        "coordinates": {"latitude": lat, "longitude": lon},
        "operator": {"name": provider}, "evses": [],
    }


def station_only_result(name, party, rows, filename, blob, reason):
    result = source(name, party, rows, [], filename, blob)
    result["summary"]["status"] = "station_only_charger_identity_missing"
    result["sourceAudit"]["connectorQuarantineReason"] = reason
    return result


def osprey(data, filename, blob):
    rows = [station_only_row(x["id"], "Osprey Charging", x["coordinates"]["latitude"],
                             x["coordinates"]["longitude"], "OSP", "Osprey Charging", x.get("address", ""))
            for x in data["locations"]]
    return station_only_result("Osprey Charging", "OSP", rows, filename, blob,
                               "public map groups connectors by count/type without stable connector or EVSE identities")


def fastned(data, filename, blob):
    rows = []
    for x in data["locations"]:
        if x.get("country") != "GB":
            raise AssertionError("Fastned: outside-GB location")
        rows.append(station_only_row(x["stationId"], x["name"], x["latitude"], x["longitude"],
                                     "FAS", "Fastned", x.get("address", ""), x.get("postalCode", "")))
    return station_only_result("Fastned", "FAS", rows, filename, blob,
                               "location page reports charging-point count and network rates, not exact connector identities")


def roam(data, filename, blob):
    rows = []
    for x in data["locations"]:
        coordinates = x["coordinates"]
        identity = (x["name"] + "|" + str(coordinates["latitude"]) + "|" + str(coordinates["longitude"])).encode()
        rows.append(station_only_row("roam:" + hashlib.sha256(identity).hexdigest()[:20], x["name"],
                                     coordinates["latitude"], coordinates["longitude"], "ROM", "Roam", x.get("address", "")))
    return station_only_result("Roam", "ROM", rows, filename, blob,
                               "public map has connector type/count and standard rate but no stable connector identities")


def lidl(data, filename, blob):
    rows = []
    for x in data["stores"]:
        if x.get("evCharging") is not True:
            raise AssertionError("Lidl: store without explicit EV charging")
        parts = [p for p in urlparse(x["url"]).path.split("/") if p]
        if len(parts) < 3 or parts[-3] != "store-finder":
            raise AssertionError("Lidl: unsupported store URL identity")
        city, street = parts[-2:]
        rows.append(station_only_row(x["url"], "Lidl " + street.replace("-", " ").title(),
                                     x["lat"], x["lon"], "LDL", "Lidl", city.replace("-", " ").title(), x.get("postcode", "")))
    return station_only_result("Lidl", "LDL", rows, filename, blob,
                               "official store locator confirms EV charging and network tariffs but publishes no EVSE IDs or powers")


def charge_my_street(data, filename, blob):
    rows = []
    for x in data["mapData"]:
        popup = x["popup"]
        id_match = re.search(r"/suggest/national/([^\"#]+)", popup)
        name_match = re.search(r"cms-popup-name[^>]*>\s*<h5>(.*?)</h5>", popup, re.S)
        if not id_match or not name_match:
            raise AssertionError("Charge My Street: public marker identity/name missing")
        lat, lon = x["marker"][0]
        rows.append(station_only_row("cms:" + id_match.group(1), html.unescape(name_match.group(1)),
                                     lat, lon, "CMS", "Charge My Street"))
    return station_only_result("Charge My Street", "CMS", rows, filename, blob,
                               "public map and network price lack charger-level connector identity and power")


def believ(data, filename, blob):
    groups = {}
    for label in data["labels"]:
        groups.setdefault(str(label["locationId"]), []).append(label)
    rows = []
    for location_id, labels in groups.items():
        first = labels[0]
        rows.append(station_only_row(location_id, first["locationName"], first["lat"], first["lng"],
                                     "BLV", "Believ", first.get("formattedAddress", "")))
    result = station_only_result("Believ", "BLV", rows, filename, blob,
                                 "national labels resolve sites but daily official EVSE/tariff review covers only a subset; do not invent connector identities")
    result["sourceAudit"]["nationalLabels"] = len(data["labels"])
    return result


def monta(data, filename, blob, locations_blob):
    raw_locations = {str(loc["id"]): loc for loc in locations_blob["locations"]}
    rows, bad = [], 0
    for joined in data["activeJoined"]:
        raw = raw_locations.get(str(joined["locationId"]))
        if not raw or raw.get("country") != "GBR" or (joined.get("pricing") or {}).get("currency") != "gbp":
            raise AssertionError("Monta: invalid exact UK join")
        lat, lon = float(raw["coordinates"]["latitude"]), float(raw["coordinates"]["longitude"])
        if not (49 <= lat <= 61 and -9 <= lon <= 3):
            bad += 1
            continue
        matches = [(evse, connector) for evse in raw["evses"] for connector in evse["connectors"]
                   if str(connector["id"]) == str(joined["connectorId"]) and str(evse.get("evse_id")) == str(joined["evseId"])]
        if len(matches) != 1:
            raise AssertionError("Monta: missing/ambiguous exact connector")
        evse, connector = matches[0]
        loc = copy.deepcopy(raw)
        loc["country_code"], loc["party_id"], loc["publish"] = "GB", "MON", True
        loc["evses"] = [{"evse_id": str(evse["evse_id"]), "status": evse.get("status"),
                         "connectors": [{"id": str(connector["id"]), "standard": connector.get("standard"),
                                         "power_type": connector.get("power_type"),
                                         "max_electric_power": connector["max_electric_power"], "tariff_ids": []}]}]
        loc["operator"] = {"name": "Monta"}
        rows.append(loc)
    if bad != 49:
        raise AssertionError(f"Monta: invalid coordinate quarantine drift {bad}")
    result = source("Monta", "MON", rows, [], filename, blob)
    result["sourceAudit"]["excludedInvalidCoordinates"] = bad
    result["sourceAudit"]["tariffQuarantineReason"] = "public pricing table has additional fee columns and unverified gross basis on some exact rows"
    return result


def parkrecharge(data, filename, blob):
    locations, excluded = [], 0
    for record in data["devices"]:
        device = record["device"]
        try:
            lat, lon = float(device["Latitude"]), float(device["Longitude"])
            valid = 49 <= lat <= 61 and -9 <= lon <= 3
        except (TypeError, ValueError, KeyError):
            valid = False
        restricted = bool(re.search(r"reserv|car club|private|permit", str(device.get("LocationFullDetails") or ""), re.I))
        if not valid or restricted:
            excluded += 1
            continue
        evses = []
        for item in device["Connectors"]:
            connector = item["connector"]
            cid = str(device["DeviceDBID"]) + ":" + str(connector["LocalConnectorNumber"])
            evses.append({
                "evse_id": "GB*HBN*E" + cid,
                "status": str(connector.get("ConnectorStatus") or "UNKNOWN"),
                "connectors": [{"id": cid, "standard": str(connector.get("ConnectorType") or "UNKNOWN"),
                                "power_type": "UNKNOWN", "max_electric_power": round(float(connector["ConnectorMaxPower"]) * 1000),
                                "tariff_ids": []}],
            })
        locations.append({
            "id": str(device["DeviceDBID"]), "country_code": "GB", "party_id": "HBN", "publish": True,
            "name": device.get("LocationName") or "ParkRecharge", "address": device.get("LocationAddress", ""),
            "postal_code": device.get("LocationPostcode", ""),
            "coordinates": {"latitude": lat, "longitude": lon},
            "operator": {"name": "ParkRecharge"}, "evses": evses,
        })
    if excluded != 16:
        raise AssertionError("ParkRecharge: coordinate/access quarantine drift")
    result = source("ParkRecharge", "HBN", locations, [], filename, blob)
    result["sourceAudit"]["excludedInvalidCoordinateOrAccessText"] = excluded
    result["sourceAudit"]["tariffQuarantineReason"] = "device fee fields and local parking charges not yet reconciled to a gross complete session price"
    return result


def geniepoint_direct_tariff(refs, source_tariffs):
    """Select the walk-up tariff only when its OCPI identity is unambiguous."""
    if not 1 <= len(refs) <= 2 or len(set(map(str, refs))) != len(refs):
        return None
    found = [source_tariffs.get(str(ref)) for ref in refs]
    if any(row is None for row in found):
        return None
    if len(found) == 1:
        return found[0] if found[0].get("type") in ("AD_HOC_PAYMENT", "REGULAR") else None
    ad_hoc = [row for row in found if row.get("type") == "AD_HOC_PAYMENT"]
    regular = [row for row in found if row.get("type") == "REGULAR"]
    return ad_hoc[0] if len(ad_hoc) == len(regular) == 1 else None


def geniepoint(data, filename, blob):
    source_tariffs = {str(row["id"]): row for row in data["tariffs"]}
    locations = copy.deepcopy(data["locations"])
    tariffs = []
    for loc in locations:
        if loc.get("party_id") != "GPT" or loc.get("country_code") != "GB" or loc.get("publish") is not True:
            raise AssertionError("GeniePoint: source ownership/public access mismatch")
        for evse in loc["evses"]:
            for connector in evse["connectors"]:
                refs = connector.get("tariff_ids") or []
                connector["tariff_ids"] = []
                original = geniepoint_direct_tariff(refs, source_tariffs)
                if not original or original.get("currency") != "GBP":
                    continue
                components = [component for element in original.get("elements") or []
                              for component in element.get("price_components") or []]
                if not components or any(component.get("vat") != 20.0 or component.get("price") is None
                                         or component.get("type") not in ("ENERGY", "TIME", "FLAT", "PARKING_TIME")
                                         for component in components):
                    continue
                if any(component["price"] != 0 for component in components
                       if component["type"] in ("TIME", "PARKING_TIME")):
                    continue
                energy = [component for component in components if component["type"] == "ENERGY"]
                flat = [component for component in components if component["type"] == "FLAT"]
                if len(energy) != 1 or len(flat) != 1:
                    continue
                cid = str(connector["id"])
                tid = "geniepoint:" + str(loc["id"]) + ":" + str(evse.get("evse_id") or evse.get("uid")) + ":" + cid
                gross = tariff(tid, round(float(energy[0]["price"]) * 1.2, 8))
                if float(flat[0]["price"]) > 0:
                    gross["elements"][0]["price_components"].append({
                        "type": "FLAT", "price": round(float(flat[0]["price"]) * 1.2, 8), "step_size": 1,
                    })
                gross["tccPriceBasis"] = "GBP_including_public_UK_VAT"
                tariffs.append(gross)
                connector["tariff_ids"] = [tid]
    result = source("GeniePoint", "GPT", locations, tariffs, filename, blob)
    result["sourceAudit"]["grossVatMethod"] = "OCPI 2.2 component price ex VAT multiplied by (1 + 20/100)"
    result["sourceAudit"]["quarantinedConnectors"] = 1138 - len(tariffs)
    result["sourceAudit"]["quarantineReason"] = "ambiguous/missing tariff identity or nonzero time/parking fee requiring full session semantics"
    result["sourceAudit"]["adHocPreference"] = "one AD_HOC_PAYMENT plus one REGULAR: use the walk-up tariff only when full fee components are calculable"
    return result


def main(uk):
    aggregate_path = uk / "all.json.gz"
    aggregate = read(aggregate_path)
    additions = []
    for filename, compiler in [
        ("uk_beev_public_map.json.gz", beev),
        ("uk_applegreen_public_stations.json.gz", applegreen),
        ("uk_wenea_direct_priced.json.gz", wenea),
        ("ionity_direct_stations_uk.json.gz", ionity),
        ("uk_zest_public_map.json.gz", zest),
        ("uk_raw_official_ocpi.json.gz", raw),
        ("uk_jolt_pcpr.json.gz", jolt),
        ("uk_3ti_fuuse.json.gz", energy_hubs),
        ("uk_shell_ev_public_locations.json.gz", shell_recharge),
        ("uk_totalenergies_chargeplus_locations.json.gz", totalenergies),
        ("uk_qwello_public_evses.json.gz", qwello),
        ("uk_osprey_public_map_priced.json.gz", osprey),
        ("fastned_direct_stations_uk.json.gz", fastned),
        ("uk_roam_public_map.json.gz", roam),
        ("uk_lidl_public_ev_stores.json.gz", lidl),
        ("uk_charge_my_street_map.json.gz", charge_my_street),
        ("uk_believ_public_labels.json", believ),
        ("uk_parkrecharge_public_devices.json.gz", parkrecharge),
        ("uk_geniepoint_official_ocpi.json.gz", geniepoint),
    ]:
        path = uk / "sources" / filename
        blob = path.read_bytes()
        payload = json.loads(blob) if path.suffix == ".json" else read(path)
        additions.append(compiler(payload, filename, blob))
    monta_path = uk / "sources" / "uk_monta_public_pricing.json.gz"
    monta_locations_path = uk / "sources" / "uk_monta_mon_locations.json.gz"
    monta_result = monta(read(monta_path), monta_path.name, monta_path.read_bytes(), read(monta_locations_path))
    monta_result["sourceAudit"]["locationSourceFile"] = monta_locations_path.name
    monta_result["sourceAudit"]["locationSourceSha256"] = hashlib.sha256(monta_locations_path.read_bytes()).hexdigest()
    additions.append(monta_result)
    names = {row["name"] for row in aggregate["sources"]}
    if names.intersection(EXPECTED):
        raise AssertionError("UK direct batch already present in aggregate")
    aggregate["sources"].extend(additions)
    summary = aggregate["summary"]
    summary["requestedSources"] += len(additions)
    summary["successfulSources"] += len(additions)
    summary["completeSources"] += len(additions)
    summary["totalLocations"] += sum(row["summary"]["locations"] for row in additions)
    summary["totalEvses"] += sum(len(loc["evses"]) for row in additions for loc in row["locations"])
    summary["totalConnectors"] += sum(row["summary"]["connectors"] for row in additions)
    with aggregate_path.open("wb") as out:
        with gzip.GzipFile(fileobj=out, mode="wb", mtime=0) as compressed:
            compressed.write(json.dumps(aggregate, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    report = {row["name"]: row["summary"] | {"sourceAudit": row["sourceAudit"]} for row in additions}
    (uk / "direct-batch-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main(Path(sys.argv[1]))
