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
    # Progress ledgers are optional for historical snapshots created before
    # ledger centralisation. Revision-specific workflows may require them.
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


    # Direct France operator overlays: fail closed on incomplete IONITY refresh.
    ionity_path=root/"snapshot-inputs/FR/direct/ionity_direct_stations_france.json.gz"
    if ionity_path.exists():
        with gzip.open(ionity_path,"rt",encoding="utf-8") as f:
            ion=json.load(f)
        assert ion["operator"]=="IONITY", ion.get("operator")
        ic=ion["counts"]
        assert ic["franceLocationCount"]>=180, ic
        assert ic["franceConnectorCount"]>=1800, ic
        assert ic["franceUnpricedConnectorCount"]==0, ic

    # IONITY Italy exact direct overlay must remain complete if present.
    ionity_it_path=root/"snapshot-inputs/IT/direct/ionity_direct_stations_italy.json.gz"
    if ionity_it_path.exists():
        with gzip.open(ionity_it_path,"rt",encoding="utf-8") as f:
            ion_it=json.load(f)
        assert ion_it["operator"]=="IONITY", ion_it.get("operator")
        itc=ion_it["counts"]
        assert itc["countryLocationCount"]>=40, itc
        assert itc["countryConnectorCount"]>=300, itc
        assert itc["countryUnpricedConnectorCount"]==0, itc

    # Kilowatt production scope must remain tariff-complete even when live
    # connector status/order changes between refreshes.
    kw_path=root/"snapshot-inputs/MA/sources/kilowatt-native-tariffs.json"
    if kw_path.exists():
        kw=load(kw_path)
        stations=kw.get("stations") or []
        assert len(stations)>=43, len(stations)
        unresolved=0
        for station in stations:
            for conn in station.get("connectors") or []:
                if conn.get("rate_price") is None:
                    unresolved+=1
        assert unresolved==0, unresolved

    # IONITY Germany direct overlay must remain complete if present.
    ionity_de_path=root/"snapshot-inputs/DE/direct/ionity_direct_stations_germany.json.gz"
    if ionity_de_path.exists():
        with gzip.open(ionity_de_path,"rt",encoding="utf-8") as f:
            ion_de=json.load(f)
        assert ion_de["operator"]=="IONITY", ion_de.get("operator")
        dec=ion_de["counts"]
        assert dec["countryLocationCount"]>=190, dec
        assert dec["countryConnectorCount"]>=1500, dec
        assert dec["countryUnpricedConnectorCount"]==0, dec

    ma=load(root/"snapshot-inputs/MA/manifest.json")
    labels={x["label"] for x in ma["sources"]}
    assert {"EVGO","FastVolt","FastVolt tariff","Kilowatt native","Kilowatt overlay","EVOne policy","TotalEnergies native"} <= labels
    assert ma["knownSourceCounts"]["EVGO"]["stations"]==17
    assert ma["knownSourceCounts"]["FastVolt"]["productionCandidates"]==97
    assert ma["knownSourceCounts"]["Kilowatt"]["tariffResolvedStations"]==43
    assert ma["knownSourceCounts"]["TotalEnergies"]=={"stations":18,"connectors":38,"pricedConnectors":38,"liveStatusConnectors":38}

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
