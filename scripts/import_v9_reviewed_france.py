#!/usr/bin/env python3
"""Prepare local French enrichments and preserve the previous verified bundle."""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from decimal import Decimal, ROUND_HALF_UP
import gzip
import hashlib
import json
from pathlib import Path, PurePosixPath
import tempfile
from zipfile import ZipFile

from import_v9_bundle import sha256, verify
from package_v9_preproduction_map import ROOT, copy_preview_file, manifest_bytes

NATIONAL = "FR:irve_static"
BORNE = "FR:labornebleue_direct"
DRIVECO = "FR:driveco_evse_tariffs"


def reviewed_archive(path: Path, receipt: dict, source: str | None = None) -> tuple[dict, str, dict]:
    """Authenticate named members before interpreting any source records."""
    source = source or receipt["sourceId"]
    if (receipt["sourceId"] != source or receipt["technicalValidation"] != "PASS" or
            receipt["jobConclusion"] != "success" or sha256(path.read_bytes()) != receipt["artifactZipSha256"]):
        raise ValueError("Reviewed ZIP or its signed receipt does not match")
    prefix = f"objects/{source.replace(':', '_')}/{receipt['artifactSetSha256']}/"
    with ZipFile(path) as archive:
        manifest_raw = archive.read("manifest.json")
        manifest = json.loads(manifest_raw)
        row, = manifest["sources"]
        if "manifestSha256" in receipt and receipt["manifestSha256"] != row["manifest_sha256"]:
            raise ValueError("Reviewed collector manifest SHA mismatch")
        entries = row["files"]
        names = {entry["path"] for entry in entries}
        members = {"manifest.json", *(prefix + name for name in names)}
        if (manifest["schema_version"] != 1 or manifest["status"] != "complete" or row["status"] != "ok" or
                row["source"] != source or row["artifact"] not in members - {"manifest.json"} or
                row["artifact_set_sha256"] != receipt["artifactSetSha256"] or entries != receipt["files"] or
                len(names) != len(entries) or len(archive.namelist()) != len(members) or set(archive.namelist()) != members or
                any(PurePosixPath(name).is_absolute() or ".." in PurePosixPath(name).parts for name in names)):
            raise ValueError("Reviewed collection membership or status mismatch")
        stamp = hashlib.sha256()
        contents = {}
        for entry in sorted(entries, key=lambda item: item["path"]):
            name = entry["path"]
            raw = archive.read(prefix + name)  # zipfile verifies CRC while reading.
            digest = sha256(raw)
            if digest != entry["sha256"] or len(raw) != entry["bytes"]:
                raise ValueError("Reviewed collection member integrity mismatch")
            stamp.update((name + "\0" + digest + "\n").encode())
            contents[name] = raw
        if stamp.hexdigest() != receipt["artifactSetSha256"] or sha256(contents[row["artifact"][len(prefix):]]) != row["sha256"]:
            raise ValueError("Reviewed collection set or primary member mismatch")
    return row, row["artifact"][len(prefix):], contents


def tenths(power):
    return Decimal(str(power)).quantize(Decimal(".1"), rounding=ROUND_HALF_UP)


def project_borne(payload, national, national_sha, artifact_sha, rule_sha):
    scope = payload["scope"]
    if (payload["dataset"] != "labornebleue-direct-tcc-v8-idf" or
            scope["countryCode"] != "FR" or scope["onlyDirectCpo"] is not True or
            scope["strictExplicitNetworkLabel"] is not True or
            scope["partnerLocationsIncluded"] is not False or scope["partnerTariffsIncluded"] is not False or
            scope["subscriptionAnnualFeeEur"] != 10 or len(payload["stations"]) != payload["counts"]["publishedStations"]):
        raise ValueError("Unexpected La Borne Bleue archive envelope")
    stations = {item["id"]: item for item in national["stations"]}
    cpos = {item["id"]: item for item in national["cpos"]}
    evses, plugs = defaultdict(list), defaultdict(list)
    for item in national["evses"]:
        if (item.get("officialEvseId") or "").startswith("FRSIPE"):
            evses[item["officialEvseId"]].append(item)
    for item in national["connectors"]:
        plugs[item["evseId"]].append(item)
    output = {key: {} for key in ("cpos", "stations", "evses", "connectors", "offers")}
    seen = set()
    rejected, accepted = [], Counter()
    count_configurations = 0
    for source_station in payload["stations"]:
        if source_station["countryCode"] != "FR" or source_station["sourceNetworkLabel"].strip().casefold() != "la borne bleue":
            raise ValueError("La Borne Bleue station network evidence is missing")
        for config in source_station["configurations"]:
            count_configurations += 1
            exact = config["pricing"]["labornebleueExact"]
            pdc_ids = config["labornebleueEvseIds"]
            subscription = config["subscriptionId"]
            if (not isinstance(pdc_ids,list) or not pdc_ids or config["stalls"] != len(pdc_ids) or
                    subscription not in (None,"labornebleue-annual") or config["offerType"] != "operator_direct" or
                    any(config.get(flag) is not True for flag in ("labornebleueDirect","labornebleueVerified","labornebleueOwnNetworkOnly")) or
                    exact["currency"] != "EUR" or config["kind"] not in ("AC", "DC")):
                raise ValueError("La Borne Bleue configuration scope is malformed")
            for source_id in pdc_ids:
                identity = source_id, subscription
                if identity in seen or not source_id.startswith("FRSIPE"):
                    raise ValueError("Duplicate or foreign La Borne Bleue EVSE tariff")
                seen.add(identity)
                rows = evses[source_id]
                reason = None
                if len(rows) != 1:
                    reason = "ambiguous_national_evse" if rows else "no_exact_national_evse"
                else:
                    row, = rows
                    station = stations[row["stationId"]]
                    if (row.get("rawSourceFields") or {}).get("ambiguousNationalEvseId"):
                        reason = "ambiguous_national_evse"
                    elif station["sourceStationId"] != source_station["stationId"]:
                        reason = "station_identity_contradiction"
                    elif station.get("publicAccessDecision") == "exclude_non_public":
                        reason = "non_public_national_station"
                    else:
                        eligible = [plug for plug in plugs[row["id"]] if plug.get("kind") == config["kind"] and
                                    plug.get("powerKw") is not None and tenths(plug["powerKw"]) == tenths(config["powerKw"])]
                        if not eligible:
                            reason = "national_power_or_connector_kind_unproved"
                if reason:
                    rejected.append({"sourceEvseId": source_id, "subscriptionId": subscription, "reason": reason})
                    continue
                output["stations"][station["id"]] = station
                output["evses"][row["id"]] = row
                output["cpos"][row["cpoId"]] = cpos[row["cpoId"]]
                for plug in eligible:
                    output["connectors"][plug["id"]] = plug
                oid = "tcc:" + sha256(json.dumps([BORNE, source_id, subscription]).encode())
                hold = None
                if config["kind"] == "DC":
                    hold = "inconsistent_dc_fee_clock"
                output["offers"][oid] = {
                    "id": oid, "channel": "Direct", "calculationStatus": "not_evaluated",
                    "scope": {"evseId": row["id"], "connectorId": None},
                    "rawOffer": {"officialEvseId": source_id, "sourceStationId": source_station["stationId"],
                                 "pricing": exact, "kind": config["kind"], "powerKw": config["powerKw"],
                                 "subscriptionId": subscription, "nationalConnectorIds": sorted(p["id"] for p in eligible)},
                    **({"calculationHold": hold} if hold else {}),
                }
                accepted[hold or "eligible_profile"] += 1
    if count_configurations != payload["counts"]["publishedConfigurations"]:
        raise ValueError("La Borne Bleue archive counts inconsistent")
    result = {"schemaVersion": 1, "source": {"id": BORNE, "artifactSha256": artifact_sha, "generatedAt": payload["generatedAt"],
              "nationalCanonicalSha256": national_sha, "pricingBasisSha256": rule_sha},
              "countries": [{"code": "FR"}], **{key: [rows[n] for n in sorted(rows)] for key, rows in output.items()}}
    return result, {"offers": dict(accepted), "rejected": rejected,
                    "stations": len(output["stations"]), "evses": len(output["evses"])}


def compose(base, destination, driveco_archive, driveco_receipt, borne_archive, borne_receipt, rules):
    from v9_rebuild.canonical import normalize_driveco_evse
    if ROOT in destination.resolve().parents or destination.resolve() == ROOT:
        raise ValueError("Use isolated storage")
    manifest = verify(base, selected_source=NATIONAL)
    national_ref, = [entry for entry in manifest["sources"] if entry["source"] == NATIONAL]
    receipts = [json.loads(path.read_bytes()) for path in (driveco_receipt, borne_receipt)]
    _, member, contents = reviewed_archive(driveco_archive, receipts[0], "FR:driveco_evse")
    driveco_payload = json.loads(contents[member])
    if any(row.get("feeSemantics", {}).get("safeForFullSessionCost") is not False for row in driveco_payload["resolved"]):
        raise ValueError("Unexpected DRIVECO full-session classification")
    driveco = normalize_driveco_evse(driveco_payload, artifact_sha256=receipts[0]["artifactSetSha256"])
    _, member, contents = reviewed_archive(borne_archive, receipts[1], BORNE)
    archived_rules = rules.read_bytes()
    basis = json.loads(archived_rules)
    if (basis["dataset"] != "labornebleue-official-idf" or
            basis["sessionSemantics"]["acMinuteBillingUsesServiceDuration"] is not True or
            basis["subscriber"]["annualFeeEur"] != 10):
        raise ValueError("Unverified La Borne Bleue duration basis")
    national = json.loads((base / national_ref["path"]).read_bytes())
    borne, proof = project_borne(json.loads(gzip.decompress(contents[member])), national, national_ref["sha256"],
                                 receipts[1]["artifactSetSha256"], sha256(archived_rules))
    del national
    values = {DRIVECO: driveco, BORNE: borne}
    sources = {item["source"]: item for item in manifest["sources"]}
    previous = sources.get(DRIVECO)
    data = {source: manifest_bytes(payload) for source,payload in values.items()}
    for source, content in data.items():
        sources[source] = {"source": source, "path": source.replace(":", "__")+".json", "sha256": sha256(content),
                           "sourceArtifactSha256": values[source]["source"]["artifactSha256"], "canonicalSchemaVersion": 1}
    manifest["sources"] = [sources[source] for source in sorted(sources)]
    raw = manifest_bytes(manifest)
    destination.mkdir(parents=True,exist_ok=True)
    bundle_id = sha256(raw)
    target = destination / bundle_id
    if not target.exists():
        with tempfile.TemporaryDirectory(dir=destination) as tmp:
            stage = Path(tmp) / bundle_id
            stage.mkdir()
            for source, row in sources.items():
                name = row["path"]
                if source in data:
                    (stage/name).write_bytes(data[source])
                else:
                    copy_preview_file(base/name,stage/name)
            (stage/"manifest.json").write_bytes(raw)
            verify(stage)
            stage.rename(target)
    else:
        verify(target)
    return {"bundleId":bundle_id,"previousBundle":base.name,"unchangedSources":len(sources)-len(data),
            "nationalSha256":national_ref["sha256"],"sourceReceipts":receipts,
            "driveco":{"previous":previous,"evses":len(driveco["evses"]),"rawOffers":len(driveco["offers"])},
            "labornebleue":proof}


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    for field in ("base", "destination", "driveco-archive", "driveco-receipt", "borne-archive", "borne-receipt", "rules"):
        p.add_argument("--"+field, required=True,type=Path)
    print(json.dumps(compose(**vars(p.parse_args())), ensure_ascii=False, indent=2))
