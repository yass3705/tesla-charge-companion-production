#!/usr/bin/env python3
"""Project a reviewed Electric 55 Scan Pay handoff onto exact national IRVE PDCs."""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import re
import tempfile
from zipfile import ZipFile

from import_v9_bundle import sha256, verify
from package_v9_preproduction_map import ROOT, copy_preview_file, manifest_bytes

SOURCE = "FR:electric55_chain"
NATIONAL = "FR:irve_static"
BASE_FILE = "data/national/electric55_static_france.json"
FINAL_FILE = "data/national/electric55_stations_france.json"
PRIOR_FILE = "input/electric55_last_good.json"
PROVENANCE_FILE = "reports/electric55/v9-chain-provenance.json"
REPORT_FILE = "reports/electric55/station_base_summary.md"
STANDARDS = {"EF": "EF", "TYPE_2": "Type 2", "CCS": "CCS"}


def reviewed_data(archive: Path, receipt: dict) -> dict:
    if (receipt["sourceId"] != SOURCE or receipt["technicalValidation"] != "PASS" or
            receipt["jobConclusion"] != "success" or sha256(archive.read_bytes()) != receipt["artifactZipSha256"]):
        raise ValueError("Electric 55 receipt or ZIP mismatch")
    expected_names = {BASE_FILE, FINAL_FILE, PRIOR_FILE, PROVENANCE_FILE, REPORT_FILE}
    prefix = f"objects/FR_electric55_chain/{receipt['artifactSetSha256']}/"
    with ZipFile(archive) as z:
        if (len(z.namelist()) != len(expected_names) + 1 or
                set(z.namelist()) != {"manifest.json", *(prefix + name for name in expected_names)} or z.testzip()):
            raise ValueError("Electric 55 ZIP inventory or CRC mismatch")
        manifest = json.loads(z.read("manifest.json"))
        row, = manifest["sources"]
        if (manifest["schema_version"] != 1 or manifest["status"] != "complete" or row["status"] != "ok" or
                row["source"] != SOURCE or row["module"] != "electric55_chain" or row["artifact"] != prefix + FINAL_FILE or
                row["artifact_set_sha256"] != receipt["artifactSetSha256"] or row["files"] != receipt["files"] or
                {entry["path"] for entry in row["files"]} != expected_names or len(row["files"]) != len(expected_names)):
            raise ValueError("Electric 55 manifest mismatch")
        files = {entry["path"]: z.read(prefix + entry["path"]) for entry in row["files"]}
    check = hashlib.sha256()
    for entry in sorted(row["files"], key=lambda item: item["path"]):
        raw = files[entry["path"]]
        if len(raw) != entry["bytes"] or sha256(raw) != entry["sha256"]:
            raise ValueError("Electric 55 entry mismatch")
        check.update((entry["path"] + "\0" + entry["sha256"] + "\n").encode())
    provenance = json.loads(files[PROVENANCE_FILE])
    if (check.hexdigest() != receipt["artifactSetSha256"] or row["sha256"] != sha256(files[FINAL_FILE]) or
            any(provenance[name] != sha256(files[path]) for name, path in
                (("baseSha256", BASE_FILE), ("finalSha256", FINAL_FILE), ("previousSha256", PRIOR_FILE)))):
        raise ValueError("Electric 55 artifact set or ancestry mismatch")
    base, final = (json.loads(files[path]) for path in (BASE_FILE, FINAL_FILE))
    if identities(base) != identities(final):
        raise ValueError("Electric 55 static and tariff identities differ")
    return final


def identities(data: dict) -> dict:
    if (data["dataset"] != "electric55-operated-stations-france" or data["country"] != "FR" or
            data["operator"] != "Electric 55 Charging (E55C)" or data["scope"]["roamingTariffsIncluded"] is not False or
            data["scope"]["dynamicStatusIncluded"] is not False):
        raise ValueError("Electric 55 source identity invalid")
    stations, points = set(), {}
    for station in data["stations"]:
        sid = station["stationId"]
        if not sid or sid in stations:
            raise ValueError("Electric 55 duplicate station")
        stations.add(sid)
        for point in station["chargePoints"]:
            evse, local = point["evseId"], point["localEvseId"]
            if (not re.fullmatch(r"FR55C[A-Z0-9]+", evse) or not re.fullmatch(r"FR\*55C\*[A-Z0-9*]+", local, re.I) or
                    evse in points):
                raise ValueError("Electric 55 EVSE identity invalid")
            points[evse] = sid, local
    if (len(stations), len(points)) != (data["stats"]["stationCount"], data["stats"]["chargePointCount"]):
        raise ValueError("Electric 55 inventory differs from its own manifest")
    return points


def project(payload: dict, catalogue: dict, national_sha: str, artifact_sha: str):
    rows = identities(payload)
    if (payload["source"]["directTariff"]["nationalOwnEmspOnlyVerified"] is not True or
            payload["tccIntegration"]["operatorDirectTariffsReady"] is not True):
        raise ValueError("Electric 55 authorization of the direct offer is missing")
    profiles = {row["profileId"]: row for row in payload["directTariffProfiles"]}
    if len(profiles) != len(payload["directTariffProfiles"]):
        raise ValueError("Electric 55 tariff profile is ambiguous")
    national_evses, plugs = defaultdict(list), defaultdict(list)
    nation_stations = {row["id"]: row for row in catalogue["stations"]}
    nation_cpos = {row["id"]: row for row in catalogue["cpos"]}
    for row in catalogue["evses"]:
        if row.get("officialEvseId", "") in rows:
            national_evses[row["officialEvseId"]].append(row)
    for row in catalogue["connectors"]:
        plugs[row["evseId"]].append(row)
    projected = {key: {} for key in ("cpos", "stations", "evses", "connectors", "offers")}
    counts = Counter()
    dispositions = []
    served_profiles = Counter()
    for station in payload["stations"]:
        for point in station["chargePoints"]:
            eid = point["evseId"]
            price = point["pricing"]
            profile = profiles.get(price.get("profileId"))
            candidates = national_evses[eid]
            resolved = price["status"] == "resolved_e55c_scan_pay"
            counts["structuredSource" if resolved else "withoutSourceTariff"] += 1
            reason = None
            if point["localEvseId"].replace("*", "").upper() != eid:
                reason = "conflicting_source_evse_identifiers"
            elif not candidates:
                reason = "no_exact_irve_evse"
            elif len(candidates) != 1 or (candidates[0].get("rawSourceFields") or {}).get("ambiguousNationalEvseId"):
                reason = "ambiguous_irve_evse"
            else:
                evse, = candidates
                target = nation_stations[evse["stationId"]]
                if target.get("publicAccessDecision") == "exclude_non_public":
                    reason = "non_public_irve_station"
                elif not resolved:
                    reason = "no_source_tariff"
                else:
                    standards = {STANDARDS.get(key) for key in point["connectors"]}
                    eligible = defaultdict(list)
                    for plug in plugs[evse["id"]]:
                        standard = re.match(r"^IRVE · (Type 2|CCS|EF)(?:\s|$)", plug.get("plugType") or "")
                        if standard and standard[1] in standards and plug.get("kind") == point.get("kind") and (plug.get("powerKw") or 0) > 0:
                            eligible[standard[1]].append(plug)
                    if not eligible or any(len(group) != 1 for group in eligible.values()):
                        reason = "no_unique_compatible_irve_connector"
            if resolved and (profile is None or price.get("source") != "e55c_public_scan_pay_tariff_display"):
                raise ValueError("Electric 55 resolved tariff lacks its exact Scan Pay profile")
            if reason:
                counts[reason] += 1
                dispositions.append({"sourceEvseId": eid, "reason": reason, "structured": resolved})
                continue
            projected["cpos"][evse["cpoId"]] = nation_cpos[evse["cpoId"]]
            projected["stations"][target["id"]] = target
            projected["evses"][evse["id"]] = evse
            eligible_ids = []
            for group in eligible.values():
                connector, = group
                projected["connectors"][connector["id"]] = connector
                eligible_ids.append(connector["id"])
            offer_id = "tcc:" + sha256(f"{SOURCE}:direct:{eid}".encode())
            projected["offers"][offer_id] = {
                "id": offer_id, "channel": "Direct", "calculationStatus": "not_evaluated",
                "scope": {"evseId": evse["id"], "connectorId": None},
                "rawOffer": {"profile": profile, "sourceEvseId": eid, "sourceStationId": station["stationId"],
                             "sourceLocalEvseId": point["localEvseId"], "kind": point["kind"],
                             "standards": point["connectors"], "nationalConnectorIds": sorted(eligible_ids)},
            }
            counts["exactEnrichments"] += 1
            served_profiles[profile["profileId"]] += 1
    if counts["structuredSource"] != payload["stats"]["chargePointCountWithMachineReadablePricing"]:
        raise ValueError("Electric 55 structured tariff counter is inconsistent")
    if not projected["offers"]:
        raise ValueError("Electric 55 artifact produced no exact enrichment")
    result = {"schemaVersion": 1, "source": {"id": SOURCE, "artifactSha256": artifact_sha, "generatedAt": payload["generatedAt"],
                                            "nationalCanonicalSha256": national_sha},
              "countries": [{"code": "FR"}], **{key: [rows[i] for i in sorted(rows)] for key, rows in projected.items()}}
    return result, {"counts": counts, "profiles": served_profiles, "unassigned": dispositions,
                    "nationalStationsEnriched": len(projected["stations"])}


def integrate(base: Path, archive: Path, receipt_path: Path, out: Path) -> dict:
    if out.resolve() == ROOT or ROOT in out.resolve().parents:
        raise ValueError("Use isolated storage")
    receipt = json.loads(receipt_path.read_bytes())
    payload = reviewed_data(archive, receipt)
    original = verify(base)
    if any(entry["source"] == SOURCE for entry in original["sources"]):
        raise ValueError("Electric 55 already integrated")
    national, = [entry for entry in original["sources"] if entry["source"] == NATIONAL]
    canonical, proof = project(payload, json.loads((base / national["path"]).read_bytes()), national["sha256"], receipt["artifactSetSha256"])
    raw = manifest_bytes(canonical)
    name = "FR__electric55_chain.json"
    original["sources"].append({"source": SOURCE, "path": name, "sha256": sha256(raw),
                                "sourceArtifactSha256": receipt["artifactSetSha256"], "canonicalSchemaVersion": 1})
    original["sources"].sort(key=lambda entry: entry["source"])
    manifest = manifest_bytes(original)
    bundle = out / sha256(manifest)
    out.mkdir(parents=True, exist_ok=True)
    if not bundle.exists():
        with tempfile.TemporaryDirectory(dir=out) as temp:
            stage = Path(temp) / bundle.name
            stage.mkdir()
            for path in base.iterdir():
                if path.name != "manifest.json":
                    copy_preview_file(str(path), str(stage / path.name))
            (stage / name).write_bytes(raw)
            (stage / "manifest.json").write_bytes(manifest)
            verify(stage)
            stage.rename(bundle)
    else:
        verify(bundle)
    return {"bundleId": bundle.name, "parentBundleId": base.name, "nationalSha256": national["sha256"],
            "electric55CanonicalSha256": sha256(raw), "artifactId": receipt["artifactId"], "runId": receipt["runId"],
            "artifactZipSha256": receipt["artifactZipSha256"], "artifactSetSha256": receipt["artifactSetSha256"],
            "generatedAt": payload["generatedAt"], "sourceCounts": receipt["scopeCounts"], **proof}


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    for arg in ("base", "archive", "receipt", "out"):
        p.add_argument("--" + arg, type=Path, required=True)
    a = p.parse_args()
    print(json.dumps(integrate(a.base, a.archive, a.receipt, a.out), indent=2))
