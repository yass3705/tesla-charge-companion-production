#!/usr/bin/env python3
"""Restore the historical exact Métropolis scope using the reviewed public grid."""
from __future__ import annotations

import argparse
from collections import defaultdict
import json
from pathlib import Path
import tempfile

from import_v9_bundle import sha256, verify
from import_v9_reviewed_france import NATIONAL, reviewed_archive
from package_v9_preproduction_map import ROOT, copy_preview_file, manifest_bytes


SOURCE = "FR:metropolis_official"
EXACT_SHA = "34de93be88651a7365de4ea1367b16d185da90bd09c8b7206bfb49817f36414b"


def confirmed_grid(exact, current):
    grid = exact["officialGrid"]
    prices = current["operatorDirect"]["publicNoSubscription"]
    fee = current["fees"]["postCharge"]
    tiers = (
        ("3.7kW", "proximityUpTo3_7Kw", "proximityUpTo3_7KwEurPerMinute"),
        ("3.7_to_22_25kW", "cityAbove3_7To22_25Kw", "cityAbove3_7To22_25KwEurPerMinute"),
        ("Express_150_to_180kW", "express150To180Kw", "express150To180KwEurPerMinute"),
    )
    if (fee["graceMinutes"] != grid["graceMinutes"] or
            fee["exceptions"]["22KwOnExpressSitesEurPerMinute"] != grid["Express_22kW"]["postChargeEurPerMinute"] or
            fee["exceptions"]["neuillySurSeine"] != {"day0800To2000EurPerMinute": grid["neuillyPostCharge"]["08:00-20:00"],
                                                    "night2000To0800EurPerMinute": grid["neuillyPostCharge"]["20:00-08:00"]} or
            any(grid[tier] != {"energyEurPerKwh": prices[price]["eurPerKwh"],
                               "postChargeEurPerMinute": fee["default"][rate]} for tier, price, rate in tiers)):
        raise ValueError("The reviewed public grid differs from the exact Métropolis archive")


def project(exact, current, national, national_sha, artifact_sha):
    confirmed_grid(exact, current)
    stations = {r["id"]: r for r in national["stations"]}
    cpos = {r["id"]: r for r in national["cpos"]}
    evses, plugs = defaultdict(list), defaultdict(list)
    keys = {r["id_pdc_itinerance"] for r in exact["exact"]}
    if len(keys) != len(exact["exact"]):
        raise ValueError("Duplicate Métropolis archive identities")
    for row in national["evses"]:
        if row.get("officialEvseId") in keys:
            evses[row["officialEvseId"]].append(row)
    for row in national["connectors"]:
        plugs[row["evseId"]].append(row)
    result = {group: {} for group in ("cpos", "stations", "evses", "connectors", "offers")}
    rejected = []
    for evidence in exact["exact"]:
        key = evidence["id_pdc_itinerance"]
        matches = evses[key]
        if len(matches) != 1 or (matches[0].get("rawSourceFields") or {}).get("ambiguousNationalEvseId"):
            rejected.append([key, "missing_or_ambiguous_national_evse"])
            continue
        row, = matches
        station = stations[row["stationId"]]
        cpo = cpos[row["cpoId"]]
        if (station["sourceStationId"] != evidence["id_station_itinerance"] or cpo["name"].casefold() != "spie citynetworks" or
                station.get("publicAccessDecision") == "exclude_non_public"):
            rejected.append([key, "station_operator_or_access_contradiction"])
            continue
        power = evidence["powerKw"]
        eligible = [plug for plug in plugs[row["id"]] if plug.get("kind") in ("AC", "DC") and
                    plug.get("powerKw") is not None and (abs(plug["powerKw"] - power) <= 0.01 or (power == 7 and plug["powerKw"] == 7.4 and plug["kind"] == "AC"))]
        if not eligible:
            rejected.append([key, "unverified_connector_power"])
            continue
        for group, value in (("cpos", cpo), ("stations", station), ("evses", row)):
            result[group][value["id"]] = value
        for plug in eligible:
            result["connectors"][plug["id"]] = plug
        oid = "tcc:" + sha256(f"{SOURCE}:{key}".encode())
        result["offers"][oid] = {"id": oid, "channel": "Direct", "calculationStatus": "not_evaluated",
                                 "scope": {"evseId": row["id"], "connectorId": None}, "rawOffer": evidence}
    return {"schemaVersion": 1, "source": {"id": SOURCE, "artifactSha256": artifact_sha, "exactScopeSha256": EXACT_SHA,
            "nationalCanonicalSha256": national_sha, "generatedAt": current["generatedAt"]}, "countries": [{"code": "FR"}],
            **{group: [items[key] for key in sorted(items)] for group, items in result.items()}}, rejected


def compose(base, destination, exact_path, archive, receipt_path):
    if ROOT in destination.resolve().parents or destination.resolve() == ROOT:
        raise ValueError("Use isolated storage")
    exact = exact_path.read_bytes()
    if sha256(exact) != EXACT_SHA:
        raise ValueError("The historical exact identities differ from the reviewed archive")
    receipt = json.loads(receipt_path.read_bytes())
    _, member, members = reviewed_archive(archive, receipt, SOURCE)
    manifest = verify(base, selected_source=NATIONAL)
    if any(row["source"] == SOURCE for row in manifest["sources"]):
        raise ValueError("Métropolis is already present in the base bundle")
    national, = [row for row in manifest["sources"] if row["source"] == NATIONAL]
    value, rejected = project(json.loads(exact), json.loads(members[member]),
                              json.loads((base / national["path"]).read_bytes()), national["sha256"], receipt["artifactSetSha256"])
    raw = manifest_bytes(value)
    filename = "FR__metropolis_official.json"
    manifest["sources"].append({"source": SOURCE, "path": filename, "sha256": sha256(raw),
                                "sourceArtifactSha256": value["source"]["artifactSha256"], "canonicalSchemaVersion": 1})
    manifest["sources"].sort(key=lambda item: item["source"])
    bundle_manifest = manifest_bytes(manifest)
    bundle = sha256(bundle_manifest)
    destination.mkdir(parents=True, exist_ok=True)
    target = destination / bundle
    if not target.exists():
        with tempfile.TemporaryDirectory(dir=destination) as tmp:
            stage = Path(tmp) / bundle
            stage.mkdir()
            for row in manifest["sources"]:
                name = row["path"]
                if name == filename:
                    (stage / name).write_bytes(raw)
                else:
                    copy_preview_file(base / name, stage / name)
            (stage / "manifest.json").write_bytes(bundle_manifest)
            verify(stage)
            stage.rename(target)
    else:
        verify(target)
    return {"bundleId": bundle, "previous": base.name, "nationalSha256": national["sha256"], "exactScopeSha256": EXACT_SHA,
            "artifactId": receipt["artifactId"], "artifactZipSha256": receipt["artifactZipSha256"],
            "offers": len(value["offers"]), "stations": len(value["stations"]), "rejected": rejected}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("base", "destination", "exact-path", "archive", "receipt-path"):
        parser.add_argument("--" + name, required=True, type=Path)
    print(json.dumps(compose(**vars(parser.parse_args())), indent=2))
