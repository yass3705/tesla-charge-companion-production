#!/usr/bin/env python3
"""Add the reviewed EWD and Fastned tariffs to exact Swiss national EVSEs."""
from __future__ import annotations

import argparse
from collections import defaultdict
import json
from pathlib import Path
import re
import tempfile

from import_v9_bundle import sha256, verify
from import_v9_reviewed_france import reviewed_archive
from package_v9_preproduction_map import ROOT, copy_preview_file, manifest_bytes

NATIONAL = "CH:swiss_integration"
OWNERS = {"CH:ewd_official": "CH*EWD", "CH:fastned_official": "CH*FASTNED"}


def alias(value):
    return value.replace("*", "").upper() if isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9*]+", value) else None


def project(source, payload, national, national_sha, artifact_sha):
    owner = OWNERS[source]
    if payload["country"] != "CH" or payload["operatorId"] != owner:
        raise ValueError("Swiss source owner or country differs")
    cpos = {row["id"]: row for row in national["cpos"]}
    stations = {row["id"]: row for row in national["stations"]}
    evses, connectors = defaultdict(list), defaultdict(list)
    for row in national["evses"]:
        key = alias(row.get("officialEvseId"))
        if key:
            evses[key].append(row)
    for row in national["connectors"]:
        connectors[row["evseId"]].append(row)
    output = {key: {} for key in ("cpos", "stations", "evses", "connectors", "offers")}
    rejected = []
    present = set()
    for raw in payload["evses"]:
        source_evse = raw["evseId"]
        key = alias(source_evse)
        if not key or key in present or raw["currency"] != "CHF":
            raise ValueError("Swiss source identity or tariff currency invalid")
        present.add(key)
        candidates = evses[key]
        reason = None
        if len(candidates) != 1:
            reason = "ambiguous_national_evse" if candidates else "no_exact_national_evse"
        else:
            row, = candidates
            st = stations[row["stationId"]]
            cpo = cpos[row["cpoId"]]
            plugs = connectors[row["id"]]
            if (row.get("rawSourceFields") or {}).get("ambiguousNationalEvseId"):
                reason = "ambiguous_national_evse"
            elif cpo["sourceOperatorId"] != owner:
                reason = "national_operator_contradiction"
            elif raw["chargingStationId"] != st["sourceStationId"]:
                reason = "national_station_contradiction"
            elif str(row.get("accessibility") or "").lower().startswith("restricted"):
                reason = "restricted_national_evse"
            elif not plugs or any(not (plug.get("powerKw") or 0)>0 for plug in plugs):
                reason = "national_connector_power_missing"
        if reason:
            rejected.append({"sourceEvseId":source_evse,"reason":reason})
            continue
        for group,key_value,value in (("cpos",cpo["id"],cpo),("stations",st["id"],st),("evses",row["id"],row)):
            output[group][key_value]=value
        for plug in plugs:
            output["connectors"][plug["id"]]=plug
        offer_id="tcc:"+sha256(f"{source}:standard:{source_evse}".encode())
        output["offers"][offer_id]={"id":offer_id,"channel":"Direct","calculationStatus":"not_evaluated",
             "sourceEvseId":source_evse,"scope":{"evseId":row["id"],"connectorId":None},"rawOffer":raw}
    if not output["offers"]:
        raise ValueError("Reviewed Swiss source provides no exact assignments")
    data={"schemaVersion":1,"source":{"id":source,"artifactSha256":artifact_sha,"nationalCanonicalSha256":national_sha,
          "generatedAt":payload["generatedAt"]},"countries":[{"code":"CH"}],
          **{key:[rows[n] for n in sorted(rows)] for key,rows in output.items()}}
    return data, {"matches":len(output["offers"]),"rejected":rejected}


def compose(base, output, artifacts):
    if output.resolve()==ROOT or ROOT in output.resolve().parents:
        raise ValueError("Use isolated storage")
    manifest=verify(base,selected_source=NATIONAL)
    national_ref,=[row for row in manifest["sources"] if row["source"]==NATIONAL]
    national=json.loads((base/national_ref["path"]).read_bytes())
    additions, evidence = {}, {}
    for archive, receipt_file in artifacts:
        receipt=json.loads(receipt_file.read_bytes())
        source=receipt["sourceId"]
        if source not in OWNERS or source in additions or any(r["source"]==source for r in manifest["sources"]):
            raise ValueError("Unexpected or duplicate Swiss enrichment")
        _,member,contents=reviewed_archive(archive,receipt,source)
        value,proof=project(source,json.loads(contents[member]),national,national_ref["sha256"],receipt["artifactSetSha256"])
        raw=manifest_bytes(value)
        name=source.replace(":","__")+".json"
        additions[name]=raw
        manifest["sources"].append({"source":source,"sha256":sha256(raw),"path":name,
             "sourceArtifactSha256":receipt["artifactSetSha256"],"canonicalSchemaVersion":1})
        evidence[source]={"artifactId":receipt["artifactId"],"artifactZipSha256":receipt["artifactZipSha256"],
                          "runId":receipt["runId"], **proof}
    if set(evidence)!=set(OWNERS):
        raise ValueError("Incomplete Swiss reviewed batch")
    manifest["sources"].sort(key=lambda entry:entry["source"])
    raw=manifest_bytes(manifest)
    bundle=sha256(raw)
    output.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(dir=output) as tmp:
        stage=Path(tmp)/bundle
        stage.mkdir()
        for row in manifest["sources"]:
            name=row["path"]
            if name in additions:
                (stage/name).write_bytes(additions[name])
            else:
                copy_preview_file(base/name,stage/name)
        (stage/"manifest.json").write_bytes(raw)
        verify(stage)
        stage.rename(output/bundle)
    return {"previous":base.name,"bundleId":bundle,"nationalSha256":national_ref["sha256"],"sources":evidence}


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base",type=Path,required=True)
    parser.add_argument("--output",type=Path,required=True)
    parser.add_argument("--artifact",type=Path,nargs=2,action="append",required=True)
    args=parser.parse_args()
    print(json.dumps(compose(args.base,args.output,args.artifact),indent=2))
