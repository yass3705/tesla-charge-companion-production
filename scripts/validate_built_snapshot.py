#!/usr/bin/env python3
import gzip
import json
import pathlib
import sys

EXPECTED={"TESLA","ES","NL","CH","MA","FR","IT","DE","UK"}

def load(path):
    return json.loads(path.read_text(encoding="utf-8"))

def revision_number(snapshot_id):
    if "-r" not in snapshot_id:
        return 1
    try:
        return int(snapshot_id.rsplit("-r",1)[1])
    except ValueError:
        return 1

def main():
    root=pathlib.Path(sys.argv[1])
    manifest=load(root/"manifest.json")
    contract=load(root/"runtime-contract.json")
    rev=revision_number(manifest["snapshotId"])
    assert manifest["snapshotId"]==contract["snapshotId"]
    if len(sys.argv)>2:
        assert manifest["snapshotId"]==sys.argv[2], (manifest["snapshotId"],sys.argv[2])
    assert manifest["policy"]=="fail-closed"
    assert set(contract["datasets"])==EXPECTED
    deployment=contract.get("deployment") or {}
    assert deployment.get("rootIndex")=="index.html", deployment
    assert deployment.get("shell")=="v9-production-shell/index.html", deployment
    assert deployment.get("controlFallback")=="control/index.html", deployment
    assert deployment.get("runtimeBase")=="runtime", deployment
    assert set(deployment.get("engineScopeCountries") or [])=={"FR","NL","IT","ES","CH","DE","GB","MA"}, deployment
    for rel in ("index.html","control/index.html","v9-production-shell/index.html","v9-production-shell/shell-config.json","assets/app.js","assets/update.js"):
        assert (root/rel).exists(), f"missing deployable file {rel}"
    root_index=(root/"index.html").read_text(encoding="utf-8")
    assert "v9-production-shell/" in root_index, "root does not enter V9 shell"
    control_index=(root/"control/index.html").read_text(encoding="utf-8")
    assert '<base href="../">' in control_index, "control fallback base missing"
    fallback_update=(root/"assets/update.js").read_text(encoding="utf-8")
    assert "legacy canary bootstrap intentionally disabled" in fallback_update
    shell_index=(root/"v9-production-shell/index.html").read_text(encoding="utf-8")
    for needle in (
        "assets/v9/adapters/germany-national.js",
        "assets/v9/adapters/uk-open-feeds.js",
        "assets/v9/production-loader-extension.js",
        "assets/v9/production-bootstrap.js",
        "../control/index.html",
    ):
        assert needle in shell_index, f"shell integration missing {needle}"
    shell_cfg=load(root/"v9-production-shell/shell-config.json")
    assert shell_cfg.get("runtimeBase")=="runtime", shell_cfg
    assert shell_cfg.get("controlIndex")=="../control/index.html", shell_cfg
    assert shell_cfg.get("snapshotId")==manifest["snapshotId"], shell_cfg
    assert set(shell_cfg.get("engineScopeCountries") or [])=={"FR","NL","IT","ES","CH","DE","GB","MA"}, shell_cfg

    runtime_integration=contract.get("runtimeIntegration") or {}
    registry_rel=runtime_integration.get("registry")
    assert registry_rel=="runtime/data/v9/source-registry.json", runtime_integration
    for rel in runtime_integration.get("scripts") or []:
        assert (root/rel).exists(), f"missing runtime integration script {rel}"
    registry=load(root/registry_rel)
    sources={x.get("id"):x for x in registry.get("sources",[]) if isinstance(x,dict)}
    de_src=sources.get("germany-production-snapshot") or {}
    uk_src=sources.get("uk-production-open-feeds") or {}
    assert de_src.get("adapter")=="germany-national-v1" and de_src.get("path")=="../snapshot-inputs/DE/all.json.gz", de_src
    assert de_src.get("ionityPath")=="../snapshot-inputs/DE/direct/ionity_direct_stations_germany.json.gz", de_src
    assert (root/"snapshot-inputs/DE/direct/ionity_direct_stations_germany.json.gz").exists()
    assert uk_src.get("adapter")=="uk-open-feeds-v1" and uk_src.get("path")=="../snapshot-inputs/UK/all.json.gz", uk_src
    assert de_src.get("optional") is False and uk_src.get("optional") is False
    for source_id in ("morocco-evgo-native","morocco-fastvolt-public","morocco-totalenergies-hosts"):
        src=sources.get(source_id) or {}
        assert str(src.get("path","")).startswith("../snapshot-inputs/MA/sources/"), src
        assert not src.get("url"), src
    kw_src=sources.get("morocco-kilowatt-public") or {}
    assert kw_src.get("profile")=="kilowatt-native-local", kw_src
    assert str((kw_src.get("paths") or {}).get("inventory","")).startswith("../snapshot-inputs/MA/sources/"), kw_src
    assert str((kw_src.get("paths") or {}).get("native","")).startswith("../snapshot-inputs/MA/sources/"), kw_src
    assert not kw_src.get("urls"), kw_src
    atlante_fr=sources.get("atlante-direct-france") or {}
    assert atlante_fr.get("path")=="../snapshot-inputs/FR/direct/atlante_direct_stations_france_latest.json.gz", atlante_fr
    assert atlante_fr.get("active") is True, atlante_fr
    assert (root/"snapshot-inputs/FR/direct/atlante_direct_stations_france_latest.json.gz").exists()
    avia_ch=sources.get("switzerland-avia-r8") or {}
    assert avia_ch.get("adapter")=="switzerland-avia-v1", avia_ch
    assert avia_ch.get("path")=="../snapshot-inputs/CH/direct/avia-guest-direct-tariffs.json", avia_ch
    assert avia_ch.get("optional") is False and avia_ch.get("active") is True, avia_ch
    assert (root/"snapshot-inputs/CH/direct/avia-guest-direct-tariffs.json").exists()
    ionity_it_src=sources.get("italy-ionity-r8") or {}
    assert ionity_it_src.get("adapter")=="italy-ionity-exact-v1", ionity_it_src
    assert ionity_it_src.get("path")=="../snapshot-inputs/IT/direct/ionity_italy_exact_reconciliation_20260923.json", ionity_it_src
    assert ionity_it_src.get("optional") is False and ionity_it_src.get("active") is True, ionity_it_src
    ionity_it_rec=root/"snapshot-inputs/IT/direct/ionity_italy_exact_reconciliation_20260923.json"
    assert ionity_it_rec.exists(), ionity_it_rec
    rec=load(ionity_it_rec)
    assert rec["counts"]["resolvedPanEvses"]==300, rec["counts"]
    assert rec["counts"]["unresolvedPanEvses"]==13, rec["counts"]
    assert rec["counts"]["apiOnlyConnectors"]==25, rec["counts"]
    prod=registry.get("productionIntegration") or {}
    assert prod.get("remainingExternalSources")==[], prod

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

    # Kilowatt completeness is defined by the validated station tariff overlay,
    # not by requiring every raw native connector to carry rate_price.
    kw_overlay_path=root/"snapshot-inputs/MA/sources/kilowatt-tariff-overlay.json"
    if kw_overlay_path.exists():
        kw=load(kw_overlay_path)
        ks=kw["summary"]
        assert ks["productionStations"]==43, ks
        assert ks["unresolved"]==0, ks
        assert ks["free"]+ks["paid"]==ks["productionStations"], ks

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

        # Production runtime applies IONITY DE only where the national baseline
        # has one unique station at the exact same 6-decimal coordinates and
        # that station is explicitly IONITY. Mixed site prices fail closed.
        if rev>=8:
            with gzip.open(root/"snapshot-inputs/DE/all.json.gz","rt",encoding="utf-8") as f:
                de_all=json.load(f)
            idx={}
            for site in de_all.get("sites",[]):
                co=site.get("coordinates") or {}
                try:key=(round(float(co.get("latitude")),6),round(float(co.get("longitude")),6))
                except (TypeError,ValueError):continue
                idx.setdefault(key,[]).append(site)
            safe=0
            for loc in ion_de.get("locations",[]):
                if str(loc.get("country","")).upper()!="DE" or loc.get("cpoIdentifier")!="IONITY_CPO":
                    continue
                try:key=(round(float(loc.get("latitude")),6),round(float(loc.get("longitude")),6))
                except (TypeError,ValueError):continue
                matches=idx.get(key,[])
                if len(matches)!=1 or "ionity" not in str(matches[0].get("operator","")).lower():
                    continue
                connectors=loc.get("connectors") or []
                if not connectors or any(c.get("pricePerKwhEur") in (None,0) for c in connectors):
                    continue
                prices={round(float(c["pricePerKwhEur"]),6) for c in connectors}
                kinds={str(c.get("kind","")).upper() for c in connectors}
                if len(prices)==1 and len(kinds)==1 and next(iter(kinds)) in {"AC","DC"}:
                    safe+=1
            assert safe>=120, {"safeIonityGermanySites":safe}

    ma=load(root/"snapshot-inputs/MA/manifest.json")
    labels={x["label"] for x in ma["sources"]}
    base_labels={"EVGO","FastVolt","FastVolt tariff","Kilowatt inventory","Kilowatt native","Kilowatt overlay","EVOne policy"}
    assert base_labels <= labels
    assert ma["knownSourceCounts"]["EVGO"]["stations"]==17
    assert ma["knownSourceCounts"]["FastVolt"]["productionCandidates"]==97
    assert ma["knownSourceCounts"]["Kilowatt"]["tariffResolvedStations"]==43
    assert (root/"snapshot-inputs/MA/sources/evgo-production.json").exists()
    assert (root/"snapshot-inputs/MA/sources/kilowatt-public-station-inventory.json").exists()
    assert (root/"snapshot-inputs/MA/sources/kilowatt-native-tariffs.json").exists()
    if rev>=4:
        assert "TotalEnergies native" in labels
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
