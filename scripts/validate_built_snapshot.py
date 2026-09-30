#!/usr/bin/env python3
import gzip
import json
import pathlib
import sys

EXPECTED={"TESLA","ES","NL","CH","MA","FR","IT","DE","UK"}

def load(path):
    return json.loads(path.read_text(encoding="utf-8"))

def main():
    root=pathlib.Path(sys.argv[1])
    manifest=load(root/"manifest.json")
    contract=load(root/"runtime-contract.json")
    assert manifest["snapshotId"]==contract["snapshotId"]
    if len(sys.argv)>2:
        assert manifest["snapshotId"]==sys.argv[2], (manifest["snapshotId"],sys.argv[2])
    assert manifest["policy"]=="fail-closed"
    assert set(contract["datasets"])==EXPECTED

    for key,row in contract["datasets"].items():
        for field in ("entry","manifest","canonical","all","offers"):
            if field in row and isinstance(row[field],str):
                p=root/row[field]
                assert p.exists(), f"{key}: missing {field} {row[field]}"

    # Guard against the earlier Tesla-inventory mistake for UK.
    for rel in (
        "snapshot-inputs/FR/cpo-ledger.json",
        "snapshot-inputs/IT/cpo-ledger.json",
        "snapshot-inputs/DE/cpo-progress.json",
        "snapshot-inputs/v9-country-progress.json",
    ):
        assert (root/rel).exists(), f"missing progress ledger: {rel}"

    uk=load(root/"snapshot-inputs/UK/manifest.json")
    assert uk["country"]=="GB"
    assert uk["canonicalCpoCount"]>=44
    assert uk["firstPassComplete"] is True
    assert not (root/"snapshot-inputs/UK/inventory.json").exists()

    # Ensure UK non-Tesla aggregate is valid gzip/JSON.
    with gzip.open(root/"snapshot-inputs/UK/all.json.gz","rt",encoding="utf-8") as f:
        uk_payload=json.load(f)
    assert isinstance(uk_payload,(dict,list))

    de=load(root/"snapshot-inputs/DE/manifest.json")
    assert de["stationCount"]==63405
    assert de["directCpoPricedSites"]==5471
    assert de["cpoStatus"]=={"totalNamedCpos":591,"complete":244,"partial":347,"blocked":0}

    ma=load(root/"snapshot-inputs/MA/manifest.json")
    labels={x["label"] for x in ma["sources"]}
    assert {"EVGO","FastVolt","FastVolt tariff","Kilowatt native","Kilowatt overlay","EVOne policy"} <= labels
    assert ma["knownSourceCounts"]["EVGO"]["stations"]==17
    assert ma["knownSourceCounts"]["FastVolt"]["productionCandidates"]==97
    assert ma["knownSourceCounts"]["Kilowatt"]["tariffResolvedStations"]==43

    print(json.dumps({
      "snapshotId":manifest["snapshotId"],
      "datasets":len(contract["datasets"]),
      "fileCount":manifest["fileCount"],
      "bytes":manifest["bytes"],
      "ukCpos":uk["canonicalCpoCount"],
      "deStations":de["stationCount"],
      "maSources":len(ma["sources"])
    }))

if __name__=="__main__":
    main()
