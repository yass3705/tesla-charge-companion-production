#!/usr/bin/env python3
"""Add positively active exact Belib EVSEs without replacing the pinned FR hub."""
import argparse
import gzip
import hashlib
import io
import json
import math
from pathlib import Path
from france_irve_existing_station import verify_existing_station


def norm(value):
    return "".join(ch for ch in str(value or "").upper() if ch.isalnum())


def read_gzip(path):
    with gzip.open(path, "rt", encoding="utf-8") as handle:
        return json.load(handle)


def write_gzip(path, value):
    data = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    with path.open("wb") as handle:
        with gzip.GzipFile(fileobj=handle, mode="wb", filename="", mtime=0) as zipped:
            zipped.write(data)
    return {"bytes": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


def supplement(target, source, dynamic, catalogue, approved_ids, expected_source_sha,
               expected_dynamic_source_sha=None):
    source_blob = source.read_bytes()
    if hashlib.sha256(source_blob).hexdigest() != expected_source_sha:
        raise ValueError("New France IRVE static SHA-256 differs from approved candidate")
    new_rows = json.load(io.TextIOWrapper(gzip.GzipFile(fileobj=io.BytesIO(source_blob)), encoding="utf-8"))
    new_by_id = {norm(row[0]): row for row in new_rows}
    if len(new_by_id) != len(new_rows):
        raise ValueError("Duplicate station identity in new France IRVE source")
    active_payload = read_gzip(dynamic)
    active = {norm(value) for value in active_payload.get("enServicePdcIds") or []}
    if not active or not active_payload.get("sourceSha256"):
        raise ValueError("No proven dynamic active EVSE source")
    if expected_dynamic_source_sha and active_payload["sourceSha256"] != expected_dynamic_source_sha:
        raise ValueError("Dynamic IRVE source SHA-256 differs from approved candidate")
    official = json.loads(catalogue.read_text())
    official_by_id = {norm(row["roamingStationId"]): row for row in official["stations"]}
    old = read_gzip(target / "all.json.gz")
    old_by_id = {norm(row[0]): row for row in old}
    if len(old_by_id) != len(old):
        raise ValueError("Duplicate station identity in pinned France inventory")
    old_evse_ids = {norm(value) for row in old for group in row[8] for value in group[6]}
    additions = []
    approved_evse = set()
    already_present = []
    for raw_id in approved_ids:
        station_id = norm(raw_id)
        if station_id not in new_by_id or station_id not in official_by_id:
            raise ValueError(f"Belib station absent from new source/catalogue: {station_id}")
        row = json.loads(json.dumps(new_by_id[station_id]))
        operator = official_by_id[station_id]
        if norm(row[0]) != station_id or norm(operator.get("operatorSourceValue")) != "TOTALENERGIES":
            raise ValueError(f"Belib operator identity mismatch: {station_id}")
        if "TOTALENERGIES" not in norm(row[5]) or operator.get("access", {}).get("condition", "").lower() not in ("accès libre", "acces libre"):
            raise ValueError(f"Belib public access or national CPO mismatch: {station_id}")
        if abs(row[3] - operator["coordinates"]["latitude"]) > 0.0001 or abs(row[4] - operator["coordinates"]["longitude"]) > 0.0001:
            raise ValueError(f"Belib location mismatch: {station_id}")
        exact = {norm(value) for config in operator["configurations"]
                 if config.get("kind") == "AC" and float(config.get("powerKw") or 0) == 7.0
                 and config.get("serviceClass") == "flex"
                 for value in config.get("roamingEvseIds") or []}
        exact &= active
        if not exact:
            raise ValueError(f"No exact positively active Belib EVSE: {station_id}")
        retained = []
        for group in row[8]:
            if group[2] != "AC" or abs(float(group[3]) - 7.0) > 0.01:
                continue
            ids = [value for value in group[6] if norm(value) in exact]
            if ids:
                group[6] = ids
                group[4] = len(ids)
                retained.append(group)
        actual = {norm(value) for group in retained for value in group[6]}
        if actual != exact or actual & approved_evse:
            raise ValueError(f"Belib EVSE scope is incomplete or duplicated: {station_id}")
        row[8] = retained
        row[6] = len(actual)
        if station_id in old_by_id:
            verify_existing_station(old_by_id[station_id], new_by_id[station_id], actual, "Belib")
            for other in old:
                if norm(other[0]) != station_id and any(norm(value) in actual for group in other[8] for value in group[6]):
                    raise ValueError(f"Belib approved EVSE also pinned at another station: {station_id}")
            already_present.append(station_id)
        else:
            if actual & old_evse_ids:
                raise ValueError(f"Belib approved EVSE already pinned elsewhere: {station_id}")
            additions.append(row)
        approved_evse.update(actual)
    manifest_path = target / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    tile_by_id = {entry["id"]: entry for entry in manifest["tiles"]}
    tile_additions = {}
    for row in additions:
        key = f"t_{math.floor(row[3] / 0.5)}_{math.floor(row[4] / 0.5)}"
        if key not in tile_by_id:
            raise ValueError(f"Missing pinned tile for exact Belib supplement: {key}")
        tile_additions.setdefault(key, []).append(row)
    for tile_id, added in tile_additions.items():
        entry = tile_by_id[tile_id]
        path = target / entry["file"]
        rows = read_gzip(path)
        rows.extend(added)
        rows.sort(key=lambda row: str(row[0]))
        updated = write_gzip(path, rows)
        entry.update({"count": len(rows), **updated})
    if additions:
        old.extend(additions)
        old.sort(key=lambda row: str(row[0]))
        result = write_gzip(target / "all.json.gz", old)
        manifest.update({"stationCount": len(old),
                         "pdcCount": int(manifest["pdcCount"]) + sum(row[6] for row in additions),
                         "allBytes": result["bytes"], "allSha256": result["sha256"]})
    proof = {"stationIds": sorted(approved_ids), "evseCount": len(approved_evse),
             "staticSha256": expected_source_sha,
             "dynamicSourceSha256": active_payload["sourceSha256"],
             "dynamicGeneratedAt": active_payload.get("generatedAt")}
    if already_present:
        proof["alreadyPresentStationIds"] = sorted(already_present)
        proof["addedStationIds"] = sorted(row[0] for row in additions)
    manifest["exactSupplement"] = proof
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    return proof


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", type=Path, required=True)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--dynamic", type=Path, required=True)
    parser.add_argument("--catalogue", type=Path, required=True)
    parser.add_argument("--source-sha256", required=True)
    parser.add_argument("--dynamic-source-sha256", required=True)
    parser.add_argument("--station-id", action="append", required=True)
    args = parser.parse_args()
    print(json.dumps(supplement(args.target, args.source, args.dynamic, args.catalogue,
                                args.station_id, args.source_sha256,
                                args.dynamic_source_sha256), ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
