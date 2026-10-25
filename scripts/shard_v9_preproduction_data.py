#!/usr/bin/env python3
"""Split a verified V9 candidate into bounded, spatial source files for preview hosting."""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import math
import shutil
import tempfile
from collections import defaultdict
from pathlib import Path

from package_v9_preproduction_map import ROOT, check_candidate


MAX_BYTES = 8_000_000


def encoded(payload: dict) -> bytes:
    return (json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode()


def spatial_key(station: dict) -> tuple[int, int] | None:
    lat, lon = station.get("latitude"), station.get("longitude")
    if (not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)) or
            not math.isfinite(lat) or not math.isfinite(lon) or abs(lat) > 90 or abs(lon) > 180):
        return None
    return math.floor(lat * 2), math.floor(lon * 2)


def shard_payload(data: dict, station_rows: list[dict]) -> dict:
    station_ids = {row["id"] for row in station_rows}
    evses = [row for row in data["evses"] if row["stationId"] in station_ids]
    evse_ids = {row["id"] for row in evses}
    connectors = [row for row in data["connectors"] if row["evseId"] in evse_ids]
    offers = [row for row in data["offers"] if row["scope"]["evseId"] in evse_ids]
    cpo_ids = {row["cpoId"] for row in station_rows}
    result = {"schemaVersion": data["schemaVersion"], "source": data["source"],
              "countries": data["countries"],
              "cpos": [row for row in data["cpos"] if row["id"] in cpo_ids],
              "stations": station_rows, "evses": evses,
              "connectors": connectors, "offers": offers}
    if "tariffCatalog" in data:
        keys = {row.get("sourceTariffKey") for row in offers if row.get("sourceTariffKey")}
        result["tariffCatalog"] = {key: value for key, value in data["tariffCatalog"].items()
                                   if key in keys}
    return result


def pieces(data: dict, stations: list[dict], limit: int):
    payload = shard_payload(data, stations)
    raw = encoded(payload)
    if len(raw) <= limit:
        yield payload, raw
        return
    if len(stations) < 2:
        raise ValueError("One station exceeds preview shard limit")
    midpoint = len(stations) // 2
    yield from pieces(data, stations[:midpoint], limit)
    yield from pieces(data, stations[midpoint:], limit)


def box(stations: list[dict]) -> list[float] | None:
    positions = [(row.get("latitude"), row.get("longitude")) for row in stations]
    if not positions or any(spatial_key(row) is None for row in stations):
        return None
    return [min(lat for lat, _ in positions), min(lon for _, lon in positions),
            max(lat for lat, _ in positions), max(lon for _, lon in positions)]


def build(candidate: Path, destination: Path, *, max_bytes: int = MAX_BYTES) -> dict:
    candidate, destination = candidate.resolve(), destination.resolve()
    if (destination.exists() or destination == ROOT or ROOT in destination.parents or
            destination == candidate or candidate in destination.parents or
            max_bytes < 1000 or max_bytes > MAX_BYTES):
        raise ValueError("Sharded output or maximum size invalid")
    original = check_candidate(candidate)
    if original["status"] != "prepared" or original["rejected"]:
        raise ValueError("Only a complete prepared candidate can be sharded")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="v9-sharded-", dir=destination.parent) as temporary:
        stage = Path(temporary) / "candidate"
        stage.mkdir()
        entries = []
        for entry in original["sources"]:
            source = entry["source"]
            source_path = candidate / entry["path"]
            data = json.loads(source_path.read_bytes())
            buckets: dict[tuple[int, int] | None, list[dict]] = defaultdict(list)
            for station in data["stations"]:
                buckets[spatial_key(station)].append(station)
            descriptors = []
            for tile in sorted(buckets, key=lambda value: (value is None, value or (0, 0))):
                rows = sorted(buckets[tile], key=lambda row: row["id"])
                for payload, raw in pieces(data, rows, max_bytes):
                    name = f"{source.replace(':', '__')}__{len(descriptors):04d}.json.bin"
                    relative = Path("shards") / name
                    path = stage / relative
                    path.parent.mkdir(parents=True, exist_ok=True)
                    compressed = gzip.compress(raw, compresslevel=6, mtime=0)
                    if len(compressed) > max_bytes:
                        raise ValueError("Compressed shard exceeds preview limit")
                    path.write_bytes(compressed)
                    descriptors.append({"path": relative.as_posix(),
                                        "sha256": hashlib.sha256(compressed).hexdigest(),
                                        "encoding": "gzip", "bytes": len(compressed),
                                        "uncompressedBytes": len(raw),
                                        "stationCount": len(payload["stations"]),
                                        "bbox": box(payload["stations"])})
            if sum(row["stationCount"] for row in descriptors) != len(data["stations"]):
                raise ValueError("Spatial source partition incomplete")
            entries.append({"source": source, "sourceSha256": entry["sha256"],
                            "sourceArtifactSha256": data["source"]["artifactSha256"],
                            "shards": descriptors})
        joins = original.get("joins", [])
        for entry in joins:
            source = candidate / entry["path"]
            target = stage / entry["path"]
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
        index = {"schemaVersion": 2, "status": "prepared", "bundleId": original["bundleId"],
                 "sources": entries, "rejected": [], "joins": joins}
        (stage / "index.json").write_bytes(encoded(index))
        stage.rename(destination)
    return {"status": "prepared", "bundleId": original["bundleId"],
            "sourceCount": len(entries), "shardCount": sum(len(row["shards"]) for row in entries)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--prepared", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--max-bytes", type=int, default=MAX_BYTES)
    args = parser.parse_args()
    print(json.dumps(build(args.prepared, args.out, max_bytes=args.max_bytes)))
