#!/usr/bin/env python3
"""Replay archived eMSP exact-EVSE evidence without transferring a price."""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import tempfile
from collections import Counter, defaultdict
from pathlib import Path

from package_v9_preproduction_map import ROOT, check_candidate


def read_electroverse(directory: Path) -> tuple[list[dict], str]:
    manifest_path = directory / "manifest.json"
    manifest_bytes = manifest_path.read_bytes()
    manifest = json.loads(manifest_bytes)
    if manifest.get("country") != "FR" or manifest.get("dataset") != "electroverse-france-evse-national-overlay":
        raise ValueError("Electroverse manifest identity invalid")
    offers, seen_tiles = [], set()
    for tile in manifest.get("tiles", []):
        name = tile.get("file")
        if not isinstance(name, str) or not name.startswith("t_") or not name.endswith(".json.gz") or "/" in name or name in seen_tiles:
            raise ValueError("Electroverse tile descriptor invalid")
        seen_tiles.add(name)
        raw = (directory / name).read_bytes()
        if hashlib.sha256(raw).hexdigest() != tile.get("sha256") or len(raw) != tile.get("bytes"):
            raise ValueError("Electroverse tile SHA or length mismatch")
        payload = json.loads(gzip.decompress(raw))
        rows = payload.get("emspOffers")
        if payload.get("country") != "FR" or not isinstance(rows, list) or len(rows) != tile.get("count"):
            raise ValueError("Electroverse tile schema or internal count invalid")
        for offer in rows:
            if offer.get("verifiedScope") == "exact_evse" and offer.get("metadata", {}).get("identityMode") == "exact_unique_national_irve_pdc":
                offers.append({"channel": "Electroverse", "offerId": offer.get("id"),
                               "officialEvseId": (offer.get("evseIds") or [None])[0] if len(offer.get("evseIds") or []) == 1 else None,
                               "proof": "archived_exact_unique_national_irve_pdc"})
    if len(seen_tiles) != manifest.get("tileCount"):
        raise ValueError("Electroverse manifest tile count invalid")
    return offers, hashlib.sha256(manifest_bytes).hexdigest()


def read_electra(path: Path) -> tuple[list[dict], str]:
    raw = path.read_bytes()
    payload = json.loads(raw)
    if payload.get("schemaVersion") != 1 or not isinstance(payload.get("verifiedLinks"), list):
        raise ValueError("Electra proof schema invalid")
    rows = []
    for link in payload["verifiedLinks"]:
        if not link.get("screenshotSha256") or not link.get("verifiedForPublishedSource"):
            continue
        for mapping in link.get("mappings", []):
            rows.append({"channel": "Electra", "offerId": mapping.get("chargeTariffId"),
                         "officialEvseId": mapping.get("evseId"),
                         "proof": "archived_app_screenshot_exact_evse_tariff_id"})
    return rows, hashlib.sha256(raw).hexdigest()


def match_proofs(national: dict, proofs: list[dict]) -> dict:
    evses = defaultdict(list)
    for evse in national.get("evses", []):
        if evse.get("country") == "FR" and evse.get("officialEvseId"):
            evses[evse["officialEvseId"]].append(evse)
    matches, unmatched, seen = [], [], set()
    for proof in proofs:
        identity = (proof.get("channel"), proof.get("offerId"), proof.get("officialEvseId"))
        if identity in seen or not all(identity):
            reason = "duplicate_or_incomplete_proof"
        else:
            seen.add(identity)
            candidates = evses.get(identity[2], [])
            reason = "no_exact_evse" if not candidates else "ambiguous_exact_evse" if len(candidates) != 1 else None
        if reason:
            unmatched.append({"channel": identity[0], "offerId": identity[1], "officialEvseId": identity[2], "reason": reason})
            continue
        target = candidates[0]
        matches.append({"channel": identity[0], "offerId": identity[1], "officialEvseId": identity[2],
                        "nationalEvseId": target["id"], "nationalStationId": target["stationId"],
                        "nationalConnectorId": None, "proof": proof["proof"]})
    matches.sort(key=lambda row: (row["channel"], row["offerId"], row["officialEvseId"]))
    unmatched.sort(key=lambda row: (str(row["channel"]), str(row["offerId"]), str(row["officialEvseId"])))
    return {"matches": matches, "unmatched": unmatched,
            "statistics": {"proofsByChannel": dict(Counter(row.get("channel") for row in proofs)),
                           "matchedByChannel": dict(Counter(row["channel"] for row in matches)),
                           "unmatchedByChannel": dict(Counter(row["channel"] for row in unmatched)),
                           "unmatchedByReason": dict(Counter(row["reason"] for row in unmatched))}}


def build(prepared: Path, electroverse: Path, electra: Path, out: Path) -> dict:
    prepared, out = prepared.resolve(), out.resolve()
    if out == ROOT or ROOT in out.parents or out == prepared or prepared in out.parents:
        raise ValueError("Report output must be isolated from checkout and candidate")
    index = check_candidate(prepared)
    descriptor = next((row for row in index["sources"] if row["source"] == "FR:irve_static"), None)
    if descriptor is None:
        raise ValueError("Prepared France national source absent")
    national = json.loads((prepared / descriptor["path"]).read_bytes())
    electroverse_rows, electroverse_sha = read_electroverse(electroverse)
    electra_rows, electra_sha = read_electra(electra)
    joined = match_proofs(national, electroverse_rows + electra_rows)
    report = {"schemaVersion": 1, "candidateBundleId": index["bundleId"],
              "inputs": {"nationalSha256": descriptor["sha256"], "electroverseManifestSha256": electroverse_sha,
                         "electraProofSha256": electra_sha},
              "policy": "exact_official_evse_only;no_connector_or_price_propagation",
              **joined}
    raw = (json.dumps(report, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode()
    digest = hashlib.sha256(raw).hexdigest()
    if out.exists():
        if out.read_bytes() != raw:
            raise ValueError("Existing immutable report differs")
    else:
        out.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=out.parent, prefix="v9-emsp-", suffix=".tmp", delete=False) as handle:
            handle.write(raw)
            temporary = Path(handle.name)
        try:
            try:
                os.link(temporary, out)
            except FileExistsError:
                if out.read_bytes() != raw:
                    raise ValueError("Concurrent report differs") from None
        finally:
            temporary.unlink(missing_ok=True)
    return {"report": str(out), "sha256": digest, "statistics": joined["statistics"]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--prepared", type=Path, required=True)
    parser.add_argument("--electroverse", type=Path, required=True)
    parser.add_argument("--electra", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(build(args.prepared, args.electroverse, args.electra, args.out)))
