"""Conservative exact identity joins for prepared canonical sources.

No site, coordinate, operator-name or power match is made here. Such additional
rules require their archived source-specific proof before implementation.
"""
from __future__ import annotations

from collections import defaultdict


def match_offers(national: dict, tariff_sources: list[dict]) -> dict:
    physical = defaultdict(list)
    national_evse = {row["id"]: row for row in national["evses"]}
    national_connectors = defaultdict(list)
    for connector in national["connectors"]:
        national_connectors[connector["evseId"]].append(connector)
    for evse in national["evses"]:
        official = evse.get("officialEvseId")
        if official:
            physical[(evse["country"], official)].append(evse)

    matches, unmatched = [], []
    for source in tariff_sources:
        source_evses = {row["id"]: row for row in source["evses"]}
        source_connectors = {row["id"]: row for row in source["connectors"]}
        for offer in source["offers"]:
            scope = offer.get("scope") or {}
            source_evse = source_evses.get(scope.get("evseId"))
            if not source_evse:
                unmatched.append({"offerId": offer.get("id"), "reason": "source_evse_missing"})
                continue
            official = source_evse.get("officialEvseId")
            if not official:
                unmatched.append({"offerId": offer["id"], "reason": "official_evse_id_missing"})
                continue
            candidates = physical.get((source_evse.get("country"), official), [])
            if len(candidates) != 1:
                unmatched.append({"offerId": offer["id"], "reason": "no_exact_evse" if not candidates else "ambiguous_exact_evse"})
                continue
            target = candidates[0]
            target_connector_id = None
            source_connector_id = scope.get("connectorId")
            if source_connector_id is not None:
                source_connector = source_connectors.get(source_connector_id)
                if not source_connector or source_connector.get("evseId") != source_evse["id"]:
                    unmatched.append({"offerId": offer["id"], "reason": "source_connector_invalid"})
                    continue
                official_connector = source_connector.get("officialConnectorId")
                if not official_connector:
                    unmatched.append({"offerId": offer["id"], "reason": "official_connector_id_missing"})
                    continue
                exact = [connector for connector in national_connectors[target["id"]]
                         if connector.get("officialConnectorId") == official_connector]
                if len(exact) != 1:
                    unmatched.append({"offerId": offer["id"], "reason": "no_exact_connector" if not exact else "ambiguous_exact_connector"})
                    continue
                target_connector_id = exact[0]["id"]
            matches.append({"offerId": offer["id"], "channel": offer["channel"],
                            "sourceId": source["source"]["id"], "nationalEvseId": target["id"],
                            "nationalStationId": target["stationId"], "nationalConnectorId": target_connector_id,
                            "proof": "exact_official_evse_and_connector" if target_connector_id else "exact_official_evse"})
    matches.sort(key=lambda row: (row["sourceId"], row["offerId"]))
    unmatched.sort(key=lambda row: (str(row["offerId"]), row["reason"]))
    return {"matches": matches, "unmatched": unmatched,
            "statistics": {"nationalEvseCount": len(national_evse), "matchedOfferCount": len(matches),
                           "unmatchedOfferCount": len(unmatched)}}


def match_archived_electra_nl(national: dict, overlay: dict) -> dict:
    """Replay the archived NL Electra exact EVSE/connector crosswalk, fail closed.

    The overlay's connector UUID is retained as provenance. The national
    connector identifier comes only from its already approved match row.
    """
    if national.get("schemaVersion") != "1.0.0" or overlay.get("country") != "NL" or not isinstance(overlay.get("tariffs"), dict):
        raise ValueError("Electra NL archive schema invalid")
    stations = defaultdict(list)
    for station in national.get("stations", []):
        if station.get("countryCode") == "NL" and station.get("partyId") == "ELD":
            stations[station.get("stationId")].append(station)
    matched, unmatched, seen = [], [], set()
    for row in overlay.get("matches", []):
        identity = (row.get("stationId"), row.get("evseId"), row.get("connectorId"), row.get("tariffKey"))
        if identity in seen:
            unmatched.append({"identity": identity, "reason": "duplicate_archived_match"})
            continue
        seen.add(identity)
        if row.get("match") != "exact_evse_unique_connector" or not all(identity) or row.get("tariffKey") not in overlay["tariffs"]:
            unmatched.append({"identity": identity, "reason": "archived_proof_or_tariff_invalid"})
            continue
        station_rows = stations.get(identity[0], [])
        if len(station_rows) != 1:
            unmatched.append({"identity": identity, "reason": "national_station_not_unique"})
            continue
        evses = [evse for evse in station_rows[0].get("evses", []) if evse.get("evseId") == identity[1]]
        if len(evses) != 1:
            unmatched.append({"identity": identity, "reason": "national_evse_not_unique"})
            continue
        connectors = [connector for connector in evses[0].get("connectors", []) if connector.get("id") == identity[2]]
        if len(connectors) != 1 or identity[3] not in (connectors[0].get("tariffKeys") or []):
            unmatched.append({"identity": identity, "reason": "national_connector_or_tariff_not_exact"})
            continue
        matched.append({"stationId": identity[0], "officialEvseId": identity[1],
                        "nationalConnectorId": identity[2], "tariffKey": identity[3],
                        "sourceConnectorId": row.get("sourceConnectorId"),
                        "channel": "Direct", "proof": "archived_exact_evse_unique_connector"})
    return {"matches": matched, "unmatched": unmatched,
            "statistics": {"matchedOfferCount": len(matched), "unmatchedOfferCount": len(unmatched)}}
