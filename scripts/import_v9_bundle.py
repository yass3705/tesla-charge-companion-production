#!/usr/bin/env python3
"""Read a prepared V9 Data Lab bundle into an isolated Production staging area."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import tempfile
from pathlib import Path


def sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def verify(bundle: Path, *, selected_source: str | None = None) -> dict:
    raw = (bundle / "manifest.json").read_bytes()
    if bundle.name != sha256(raw):
        raise ValueError("Bundle manifest SHA mismatch")
    manifest = json.loads(raw)
    if manifest.get("schemaVersion") != 1 or manifest.get("state") != "prepared" or not isinstance(manifest.get("sources"), list):
        raise ValueError("Bundle manifest invalid")
    names = {"manifest.json"}
    ids = set()
    for entry in manifest["sources"]:
        source = entry.get("source", "")
        if not re.fullmatch(r"[A-Z]{2}:[a-z0-9_]+", source) or source in ids:
            raise ValueError("Bundle source ID invalid")
        ids.add(source)
        name = source.replace(":", "__") + ".json"
        if entry.get("path") != name or entry.get("canonicalSchemaVersion") != 1:
            raise ValueError("Bundle source schema or path invalid")
        names.add(name)
        if selected_source is not None and source != selected_source:
            continue
        payload_raw = (bundle / name).read_bytes()
        if sha256(payload_raw) != entry.get("sha256"):
            raise ValueError("Bundle source SHA mismatch")
        payload = json.loads(payload_raw)
        provenance = payload.get("source") or {}
        if payload.get("schemaVersion") != 1 or provenance.get("id") != source or provenance.get("artifactSha256") != entry.get("sourceArtifactSha256"):
            raise ValueError("Bundle source provenance mismatch")
        for collection in ("cpos", "stations", "evses", "connectors", "offers"):
            if not isinstance(payload.get(collection), list):
                raise ValueError("Bundle canonical schema invalid")
        known = {}
        for collection in ("cpos", "stations", "evses", "connectors", "offers"):
            keys = [row.get("id") for row in payload[collection]]
            if any(not isinstance(key, str) or not key for key in keys) or len(keys) != len(set(keys)):
                raise ValueError("Bundle canonical identity invalid")
            known[collection] = set(keys)
        for station in payload["stations"]:
            if station.get("cpoId") not in known["cpos"]:
                raise ValueError("Bundle station ownership invalid")
        stations_by_id = {row["id"]: row for row in payload["stations"]}
        connectors_by_id = {row["id"]: row for row in payload["connectors"]}
        for evse in payload["evses"]:
            if evse.get("stationId") not in known["stations"] or evse.get("cpoId") not in known["cpos"]:
                raise ValueError("Bundle EVSE relation invalid")
            station = stations_by_id[evse["stationId"]]
            if evse["cpoId"] != station["cpoId"] or evse.get("country") != station.get("country"):
                raise ValueError("Bundle EVSE ownership invalid")
            if evse.get("officialEvseId") != evse.get("sourceEvseId"):
                raise ValueError("Bundle official EVSE identity altered")
        for connector in payload["connectors"]:
            if connector.get("evseId") not in known["evses"]:
                raise ValueError("Bundle connector relation invalid")
            official_connector = connector.get("officialConnectorId")
            if official_connector is not None and (not isinstance(official_connector, str) or
                                                   not official_connector or
                                                   official_connector != connector.get("sourceConnectorId")):
                raise ValueError("Bundle official connector identity altered")
        for offer in payload["offers"]:
            scope = offer.get("scope") or {}
            if offer.get("channel") not in {"Direct", "Electra", "Electroverse"} or scope.get("evseId") not in known["evses"]:
                raise ValueError("Bundle offer scope invalid")
            if scope.get("connectorId") is not None and scope["connectorId"] not in known["connectors"]:
                raise ValueError("Bundle offer connector scope invalid")
            if scope.get("connectorId") is not None and connectors_by_id[scope["connectorId"]]["evseId"] != scope["evseId"]:
                raise ValueError("Bundle offer connector ownership invalid")
    if {path.name for path in bundle.iterdir()} != names:
        raise ValueError("Bundle file set mismatch")
    return manifest


def import_source(bundle: Path, source: str, destination: Path) -> Path:
    manifest = verify(bundle, selected_source=source)
    if source not in {item["source"] for item in manifest["sources"]}:
        raise ValueError("Requested source absent from prepared bundle")
    destination.mkdir(parents=True, exist_ok=True)
    target = destination / (source.replace(":", "__") + ".json")
    raw = (bundle / target.name).read_bytes()
    with tempfile.NamedTemporaryFile(dir=destination, prefix="v9-import-", suffix=".tmp", delete=False) as handle:
        handle.write(raw)
        temporary = Path(handle.name)
    temporary.replace(target)
    return target


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bundle", required=True, type=Path)
    parser.add_argument("--source", required=True)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    print(import_source(args.bundle, args.source, args.out))


if __name__ == "__main__":
    main()
