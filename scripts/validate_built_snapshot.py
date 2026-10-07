#!/usr/bin/env python3
import gzip
import json
import pathlib
import sys

EXPECTED={"TESLA","ES","NL","CH","MA","FR","IT","DE","UK","BE"}

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
    be_enabled=manifest["snapshotId"][:10]>="2026-10-07"
    expected=EXPECTED if be_enabled else EXPECTED-{"BE"}
    assert set(contract["datasets"])==expected
    deployment=contract.get("deployment") or {}
    assert deployment.get("rootIndex")=="index.html", deployment
    assert deployment.get("shell")=="v9-production-shell/index.html", deployment
    assert deployment.get("controlFallback")=="control/index.html", deployment
    assert deployment.get("runtimeBase")=="runtime", deployment
    assert set(deployment.get("engineScopeCountries") or [])=={"FR","NL","IT","ES","CH","DE","GB","MA"}|({"BE"} if be_enabled else set()), deployment
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
        "assets/v9/adapters/switzerland-avia.js",
        "assets/v9/adapters/italy-ionity-exact.js",
        "assets/v9/adapters/france-ionity-exact.js",
        "assets/v9/adapters/atlante-italy-exact.js",
        "assets/v9/production-loader-extension.js",
        "assets/v9/production-bootstrap.js",
        "../control/index.html",
    ):
        assert needle in shell_index, f"shell integration missing {needle}"
    shell_cfg=load(root/"v9-production-shell/shell-config.json")
    assert shell_cfg.get("runtimeBase")=="runtime", shell_cfg
    assert shell_cfg.get("controlIndex")=="../control/index.html", shell_cfg
    assert shell_cfg.get("snapshotId")==manifest["snapshotId"], shell_cfg
    assert set(shell_cfg.get("engineScopeCountries") or [])=={"FR","NL","IT","ES","CH","DE","GB","MA"}|({"BE"} if be_enabled else set()), shell_cfg
    if be_enabled:
        be_manifest=load(root/"runtime/data/v9/belgium-static/manifest.json")
        be_offers=load(root/"runtime/data/v9/belgium-nap-offers/manifest.json")
        assert be_manifest.get("stationCount",0)>15000 and be_offers.get("offerCount",0)>10000,(be_manifest,be_offers)

    if manifest["snapshotId"][:10]>="2026-10-06":
        fr_static=root/"runtime/data/v9/france-static"
        fr_manifest=load(fr_static/"manifest.json")
        assert fr_manifest.get("sourceUrl")=="https://proxy.transport.data.gouv.fr/resource/consolidation-transport-irve-statique",fr_manifest.get("sourceUrl")
        assert fr_manifest.get("pdcCount",0)>120000 and (fr_static/"all.json.gz").exists(),fr_manifest.get("pdcCount")

    runtime_integration=contract.get("runtimeIntegration") or {}
    registry_rel=runtime_integration.get("registry")
    assert registry_rel=="runtime/data/v9/source-registry.json", runtime_integration
    for rel in runtime_integration.get("scripts") or []:
        assert (root/rel).exists(), f"missing runtime integration script {rel}"
    registry=load(root/registry_rel)
    sources={x.get("id"):x for x in registry.get("sources",[]) if isinstance(x,dict)}
    if manifest["snapshotId"][:10]>="2026-10-07":
        status_src=sources.get("france-irve-dynamic") or {}
        assert status_src.get("freshnessMaxMinutes")==2880 and status_src.get("livePath"," ").endswith("/data/national/france-irve-dynamic-status-v9.json.gz"),status_src
        status_path=root/"runtime/data/v9/france-irve-dynamic-status.json.gz"
        assert status_path.exists(),status_path
        with gzip.open(status_path,"rt",encoding="utf-8") as f:
            status=json.load(f)
        assert status.get("generatedAt") and status.get("matchedPdc",0)>100000,status.get("matchedPdc")
        assert status.get("displayExcludedPdc",0)==len(status.get("records") or []),status.get("displayExcludedPdc")
    de_src=sources.get("germany-production-snapshot") or {}
    uk_src=sources.get("uk-production-open-feeds") or {}
    assert de_src.get("adapter")=="germany-national-v1" and de_src.get("path")=="../snapshot-inputs/DE/all.json.gz", de_src
    assert de_src.get("ionityPath")=="../snapshot-inputs/DE/direct/ionity_direct_stations_germany.json.gz", de_src
    assert (root/"snapshot-inputs/DE/direct/ionity_direct_stations_germany.json.gz").exists()
    ionity_extra=sources.get("germany-ionity-isolated-r8") or {}
    assert ionity_extra.get("adapter")=="germany-national-v1", ionity_extra
    assert ionity_extra.get("path")=="../snapshot-inputs/DE/direct/ionity_isolated_unpriced_supplement.json",ionity_extra
    assert ionity_extra.get("active") is True and ionity_extra.get("optional") is False
    extra_path=root/"snapshot-inputs/DE/direct/ionity_isolated_unpriced_supplement.json"
    extra=load(extra_path)
    assert len(extra.get("sites") or [])==3, extra.get("metadata")
    assert extra["metadata"]["quarantinedNearThirdParty"]==8
    assert extra["metadata"]["alreadyNearNationalIonity"]==188
    assert len({site["id"] for site in extra["sites"]})==3
    assert all(site.get("pricing")=={} and site.get("evseIds")==[] for site in extra["sites"])
    assert all(site.get("source",{}).get("unpricedFailClosed") is True for site in extra["sites"])
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
    electroverse_fr=sources.get("france-electroverse-r8") or {}
    assert electroverse_fr.get("adapter")=="direct-offer-json", electroverse_fr
    assert electroverse_fr.get("path")=="../snapshot-inputs/FR/platforms/electroverse-runtime-offers.json", electroverse_fr
    assert electroverse_fr.get("optional") is False and electroverse_fr.get("active") is True, electroverse_fr
    ev_runtime=root/"snapshot-inputs/FR/platforms/electroverse-runtime-offers.json"
    assert ev_runtime.exists(), ev_runtime
    ev_payload=load(ev_runtime)
    ev_meta=ev_payload.get("metadata") or {}
    assert len(ev_payload.get("emspOffers") or [])>=1000, ev_meta
    assert ev_meta.get("publishedOffers")==len(ev_payload.get("emspOffers") or []), ev_meta
    assert 1000<=ev_meta.get("publishedStationOffers",0)<=ev_meta["publishedOffers"], ev_meta
    assert sum((ev_meta.get("nationalJoin") or {}).values())+ev_meta.get("heterogeneousExactEvseFallbackOffers",0)==ev_meta["publishedOffers"], ev_meta
    assert (ev_payload.get("policy") or {}).get("unsupportedOrAmbiguousComplexPricingFailClosed") is True, ev_payload.get("policy")
    assert (ev_payload.get("policy") or {}).get("heterogeneousConnectorTariffRequiresExactEvse") is True, ev_payload.get("policy")
    avia_ch=sources.get("switzerland-avia-r8") or {}
    assert avia_ch.get("adapter")=="switzerland-avia-v1", avia_ch
    assert avia_ch.get("path")=="../snapshot-inputs/CH/direct/avia-guest-direct-tariffs.json", avia_ch
    assert avia_ch.get("optional") is False and avia_ch.get("active") is True, avia_ch
    assert (root/"snapshot-inputs/CH/direct/avia-guest-direct-tariffs.json").exists()
    atlante_it_src=sources.get("italy-atlante-r8") or {}
    assert atlante_it_src.get("adapter")=="atlante-italy-exact-v1", atlante_it_src
    assert atlante_it_src.get("path")=="../snapshot-inputs/IT/direct/atlante_direct_stations_italy_latest.json.gz", atlante_it_src
    assert atlante_it_src.get("optional") is False and atlante_it_src.get("active") is True, atlante_it_src
    atlante_it_path=root/"snapshot-inputs/IT/direct/atlante_direct_stations_italy_latest.json.gz"
    assert atlante_it_path.exists(), atlante_it_path
    with gzip.open(atlante_it_path,"rt",encoding="utf-8") as f:
        atlante_it=json.load(f)
    atlante_connectors=sum(len(x.get("connectors") or []) for x in atlante_it.get("locations") or [])
    atlante_priced=sum(1 for x in atlante_it.get("locations") or [] for y in x.get("connectors") or [] if y.get("pricePerKwhEur") not in (None,0))
    assert len(atlante_it.get("locations") or [])>=470, len(atlante_it.get("locations") or [])
    assert atlante_connectors>=1800 and atlante_priced==atlante_connectors, {"connectors":atlante_connectors,"priced":atlante_priced}
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
    de_tiles=load(root/"snapshot-inputs/DE/tiles/manifest.json")
    assert de_tiles["stationCount"]==63405, de_tiles
    assert de_tiles["tiledStationCount"]+de_tiles["skippedWithoutCoordinates"]==63405, de_tiles
    assert de_tiles["tileCount"]>100, de_tiles
    assert de_src.get("tileManifest")=="../snapshot-inputs/DE/tiles/manifest.json", de_src
    assert de_src.get("tileRoot")=="../snapshot-inputs/DE/tiles/", de_src


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
