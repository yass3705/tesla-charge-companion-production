#!/usr/bin/env python3
"""Add exact, public BUMP EVSEs with positive current IRVE status to the frozen FR hub."""
import argparse
import copy
import gzip
import hashlib
import json
import math
from collections import defaultdict
from pathlib import Path

from supplement_france_irve_exact import read_gzip, write_gzip
from france_irve_existing_station import verify_existing_station


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def source_index(rows):
    by_evse = defaultdict(list)
    for row in rows:
        for group in row[8] or []:
            for evse in group[6] or []:
                by_evse[str(evse).upper()].append((row, group))
    return by_evse


def discover(pinned_static, newer_static, dynamic, bump_graphql, unjoined_catalogue,
             source_commit):
    old = read_gzip(pinned_static)
    new = read_gzip(newer_static)
    active_payload = read_gzip(dynamic)
    bump = read_gzip(bump_graphql)
    unjoined = json.loads(Path(unjoined_catalogue).read_text())["unjoinedSourceRankableEvse"]
    ids = {row["evseId"].upper() for row in unjoined}
    if len(ids) != len(unjoined) or bump.get("scope", {}).get("directCpoOnly") is not True:
        raise AssertionError("BUMP source scope or unjoined EVSE identity invalid")
    old_index, new_index = source_index(old), source_index(new)
    active = {str(value).upper() for value in active_payload["enServicePdcIds"]}
    app = defaultdict(list)
    for station in bump["stations"]:
        match = station.get("match") or {}
        for point in match.get("points") or []:
            if point.get("idPdcItinerance"):
                app[str(point["idPdcItinerance"]).upper()].append((station, point))
    approved = defaultdict(list)
    rejected_geo = []
    inactive, absent = [], []
    for evse in sorted(ids):
        if evse in old_index:
            raise AssertionError(f"BUMP unjoined source EVSE already in frozen inventory: {evse}")
        links = new_index.get(evse) or []
        if not links:
            absent.append(evse); continue
        if len(links) != 1 or len(app.get(evse) or []) != 1:
            raise AssertionError(f"BUMP new IRVE or app identity ambiguous: {evse}")
        if evse not in active:
            inactive.append(evse); continue
        row, group = links[0]
        station, point = app[evse][0]
        if row[5].casefold() != "bump" or row[10].casefold() != "bump":
            raise AssertionError(f"BUMP public operator mismatch: {evse}")
        if group[2] not in ("AC", "DC") or not any(kind in group[1].casefold() for kind in ("type 2", "ccs", "prise normale", "ef")):
            raise AssertionError(f"BUMP unsupported connector: {evse}")
        if not point.get("mapped") or not isinstance(point.get("tariff"), dict) or station.get("match", {}).get("status") != "matched":
            raise AssertionError(f"BUMP official exact direct tariff absent: {evse}")
        if abs(float(point["powerKw"]) - float(group[3])) > 1:
            raise AssertionError(f"BUMP exact EVSE power disagrees: {evse}")
        same_site = (abs(station["latitude"] - row[3]) < 0.0001 and
                     abs(station["longitude"] - row[4]) < 0.0001 and
                     station["name"].casefold() == row[1].casefold())
        if not same_site:
            rejected_geo.append({"evseId": evse, "nationalStationId": row[0],
                                 "bumpStationId": station["idStationItinerance"],
                                 "reason": "name_or_coordinates_disagree"})
            continue
        approved[row[0]].append({"evseId": evse, "kind": group[2], "powerKw": group[3],
                                 "bumpStationId": station["idStationItinerance"],
                                 "appLocationId": station["match"]["locationId"],
                                 "tariffId": point["tariff"]["tariffId"]})
    rows_by_id = {row[0]: row for row in new}
    stations = [{"nationalStationId": sid, "name": rows_by_id[sid][1],
                 "latitude": rows_by_id[sid][3], "longitude": rows_by_id[sid][4],
                 "evses": sorted(evses, key=lambda x: x["evseId"])}
                for sid, evses in sorted(approved.items())]
    proof = {"schemaVersion": 1, "country": "FR", "policy": "unique_exact_evse_public_bump_positive_dynamic_status",
             "sourceDataLabCommit": source_commit, "sourceArtifactSha256": sha256(bump_graphql),
             "newerIrveSha256": sha256(newer_static), "dynamicArtifactSha256": sha256(dynamic),
             "dynamicSourceSha256": active_payload["sourceSha256"],
             "dynamicGeneratedAt": active_payload["generatedAt"],
             "counts": {"unjoinedSourceEvse": len(ids), "absentNewerIrve": len(absent),
                        "notPositivelyActive": len(inactive), "rejectedGeoOrName": len(rejected_geo),
                        "approvedStations": len(stations),
                        "approvedEvse": sum(len(s["evses"]) for s in stations)},
             "rejectedGeoOrName": rejected_geo, "stations": stations}
    if proof["counts"] != {"unjoinedSourceEvse": 543, "absentNewerIrve": 485,
                           "notPositivelyActive": 16, "rejectedGeoOrName": 3,
                           "approvedStations": 21, "approvedEvse": 39}:
        raise AssertionError(f"BUMP selective IRVE proof counts changed: {proof['counts']}")
    return proof


def supplement(target, source, dynamic, evidence, expected_source_sha, expected_dynamic_sha):
    if sha256(source) != expected_source_sha or sha256(dynamic) != expected_dynamic_sha:
        raise AssertionError("BUMP source/dynamic artifact hash drift")
    proof = json.loads(Path(evidence).read_text())
    if proof["newerIrveSha256"] != expected_source_sha or proof["dynamicArtifactSha256"] != expected_dynamic_sha:
        raise AssertionError("BUMP evidence provenance drift")
    active_payload = read_gzip(dynamic)
    if proof["dynamicSourceSha256"] != active_payload["sourceSha256"]:
        raise AssertionError("BUMP dynamic source provenance drift")
    active = {str(value).upper() for value in active_payload["enServicePdcIds"]}
    newer_rows = read_gzip(source)
    newer_by_id = {row[0]: row for row in newer_rows}
    if len(newer_by_id) != len(newer_rows):
        raise AssertionError("Duplicate station identity in new France IRVE source")
    old = read_gzip(Path(target) / "all.json.gz")
    old_ids = {row[0] for row in old}
    old_index = source_index(old)
    old_evse = set(old_index)
    additions, accepted = [], set()
    already_present = []
    for station in proof["stations"]:
        sid = station["nationalStationId"]
        if sid not in newer_by_id:
            raise AssertionError(f"BUMP supplement station absent from source: {sid}")
        row = copy.deepcopy(newer_by_id[sid])
        if row[5].casefold() != "bump" or row[10].casefold() != "bump" or row[1] != station["name"]:
            raise AssertionError(f"BUMP station operator/name drift: {sid}")
        if abs(row[3] - station["latitude"]) > 1e-6 or abs(row[4] - station["longitude"]) > 1e-6:
            raise AssertionError(f"BUMP station location drift: {sid}")
        exact = {item["evseId"].upper(): item for item in station["evses"]}
        if not exact or len(exact) != len(station["evses"]):
            raise AssertionError(f"BUMP station EVSE set invalid: {sid}")
        groups = []
        for group in row[8]:
            selected = [evse for evse in group[6] if evse.upper() in exact]
            if selected:
                for evse in selected:
                    item = exact[evse.upper()]
                    if group[2] != item["kind"] or abs(float(group[3]) - float(item["powerKw"])) > 0.01:
                        raise AssertionError(f"BUMP connector power/kind drift: {evse}")
                group[6] = selected
                group[4] = len(selected)
                groups.append(group)
        current = {evse.upper() for group in groups for evse in group[6]}
        if current != set(exact) or current - active or current & accepted:
            raise AssertionError(f"BUMP EVSE identity/status invalid: {sid}")
        row[8] = groups
        row[6] = len(current)
        if sid in old_ids:
            existing = [item for item in old if item[0] == sid]
            if len(existing) != 1:
                raise AssertionError(f"BUMP duplicate pinned station identity: {sid}")
            verify_existing_station(existing[0], newer_by_id[sid], current, "BUMP")
            for evse in current:
                if any(linked[0][0] != sid for linked in old_index[evse]):
                    raise AssertionError(f"BUMP approved EVSE pinned at another station: {evse}")
            already_present.append(sid)
        else:
            if current & old_evse:
                raise AssertionError(f"BUMP approved EVSE already pinned elsewhere: {sid}")
            additions.append(row)
        accepted.update(current)
    if len(additions) + len(already_present) != 21 or len(accepted) != 39:
        raise AssertionError("BUMP approved active supplement count drift")
    manifest_path = Path(target) / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    tile_by_id = {entry["id"]: entry for entry in manifest["tiles"]}
    by_tile = defaultdict(list)
    for row in additions:
        tile = f"t_{math.floor(row[3] / 0.5)}_{math.floor(row[4] / 0.5)}"
        by_tile[tile].append(row)
    for tile, rows in by_tile.items():
        entry = tile_by_id.get(tile)
        if entry is None:
            lat_index, lon_index = (int(part) for part in tile.split("_")[1:])
            entry = {"id": tile, "file": f"{tile}.json.gz",
                     "minLat": lat_index * 0.5, "maxLat": (lat_index + 1) * 0.5,
                     "minLon": lon_index * 0.5, "maxLon": (lon_index + 1) * 0.5}
            manifest["tiles"].append(entry)
        path = Path(target) / entry["file"]
        content = read_gzip(path) if path.exists() else []
        content.extend(rows)
        content.sort(key=lambda row: str(row[0]))
        entry.update({"count": len(content), **write_gzip(path, content)})
    if additions:
        old.extend(additions)
        old.sort(key=lambda row: str(row[0]))
        result = write_gzip(Path(target) / "all.json.gz", old)
        manifest.update({"stationCount": len(old),
                         "pdcCount": int(manifest["pdcCount"]) + sum(row[6] for row in additions),
                         "allBytes": result["bytes"], "allSha256": result["sha256"]})
    report = {"stationCount": len(additions) + len(already_present), "evseCount": len(accepted),
              "evidenceSha256": sha256(evidence),
              "dynamicSourceSha256": proof["dynamicSourceSha256"]}
    if already_present:
        report["alreadyPresentStationIds"] = sorted(already_present)
        report["addedStationIds"] = sorted(row[0] for row in additions)
    manifest.update({"tileCount": len(manifest["tiles"]), "bumpExactSupplement": report})
    manifest["tiles"].sort(key=lambda entry: entry["id"])
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pinned-static", required=True)
    parser.add_argument("--newer-static", required=True)
    parser.add_argument("--dynamic", required=True)
    parser.add_argument("--bump-graphql", required=True)
    parser.add_argument("--unjoined-catalogue", required=True)
    parser.add_argument("--source-commit", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    result = discover(args.pinned_static, args.newer_static, args.dynamic, args.bump_graphql,
                      args.unjoined_catalogue, args.source_commit)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(result["counts"], sort_keys=True))


if __name__ == "__main__":
    main()
