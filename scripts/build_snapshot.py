#!/usr/bin/env python3
import argparse
import hashlib
import json
import pathlib
import shutil
import subprocess
import sys

def sha256(path):
    h=hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda:f.read(1024*1024), b""):
            h.update(chunk)
    return h.hexdigest()

def copy_file(src,dst):
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src,dst)

def copy_tree(src,dst):
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src,dst)

def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))

def write_json(path,obj):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--stable",required=True)
    ap.add_argument("--datalab",required=True)
    ap.add_argument("--germany-source")
    ap.add_argument("--out",required=True)
    ap.add_argument("--config",default="config/snapshots/2026-09-30.json")
    a=ap.parse_args()

    stable=pathlib.Path(a.stable)
    dl=pathlib.Path(a.datalab)
    out=pathlib.Path(a.out)
    cfg=load_json(pathlib.Path(a.config))
    if out.exists(): shutil.rmtree(out)
    out.mkdir(parents=True)

    # Preserve the validated legacy V9 runtime as a compatibility baseline.
    copy_tree(stable/"v9-production-runtime", out/"runtime")
    # Production owns the integration layer. Start from the pinned stable
    # engine, then overlay production-only adapters/loaders and rewrite the
    # source registry so snapshot inputs are actually consumable at runtime.
    production_root=pathlib.Path(__file__).resolve().parents[1]
    overrides=production_root/"runtime-overrides"
    if overrides.exists():
        for src in overrides.rglob("*"):
            if src.is_file():
                copy_file(src,out/"runtime"/src.relative_to(overrides))
    registry=out/"runtime/data/v9/source-registry.json"
    subprocess.run([sys.executable,str(production_root/"scripts/build_runtime_registry.py"),str(registry)],check=True)
    subprocess.run([sys.executable,str(production_root/"scripts/build_electra_direct_offers.py"),str(dl/"data/operator_direct/electra_exact_france.json"),str(out/"runtime/data/v9/electra-direct-france.json")],check=True)
    snapshot_date=str(cfg.get("snapshotId") or "")[:10]
    if snapshot_date>="2026-10-06":
        izivia_fast_source=dl/"data/operator_direct/izivia_fast_direct_france_2026_10_06.json"
        if not izivia_fast_source.exists():
            raise SystemExit(f"Pinned Data Lab IZIVIA FAST direct offers missing: {izivia_fast_source}")
        copy_file(izivia_fast_source,out/"runtime/data/v9/izivia-fast-france.json")
        izivia_fast_inventory=dl/"data/operator_direct/izivia_fast_inventory_france_2026_10_06.json"
        if not izivia_fast_inventory.exists():
            raise SystemExit(f"Pinned Data Lab IZIVIA FAST connector correction missing: {izivia_fast_inventory}")
        copy_file(izivia_fast_inventory,out/"runtime/data/v9/izivia-fast-inventory-france.json")
    # The Dole connector evidence was captured on 2026-10-05. Keep older
    # immutable snapshot candidates on their original AC-only inventory.
    if len(snapshot_date)==10 and snapshot_date<"2026-10-06":
        reg=load_json(registry)
        for src in reg.get("sources",[]):
            sid=src.get("id")
            if sid in {"france-izivia-fast-official-france","france-izivia-fast-official-inventory","france-izivia-fast-dole-inventory","france-izivia-fast-dole-direct"}:
                src["active"]=False
                src["optional"]=True
                src["disabledReason"]="IZIVIA FAST source evidence postdates this historical snapshot"
        write_json(registry,reg)

    # Build a self-contained deployable shell in the production snapshot.
    # Root enters V9 directly; the pinned V7.3 control remains available only
    # as an explicit local fallback under /control/.
    copy_tree(stable/"assets", out/"assets")
    copy_tree(stable/"data", out/"data")
    copy_tree(stable/"v9-production-shell", out/"v9-production-shell")
    # Production-owned shell override: keep stable as fallback baseline while
    # allowing V9 UI behavior to evolve without mutating the stable repository.
    shell_override=production_root/"v9-production-shell"
    if (shell_override/"bridge.js").exists():
        copy_file(shell_override/"bridge.js",out/"v9-production-shell/bridge.js")

    tesla_cfg=next((d for d in cfg.get("datasets",[]) if d.get("id")=="TESLA"),{})
    if tesla_cfg.get("primarySource")=="dataLab":
        tesla_path=tesla_cfg.get("path")
        if not tesla_path:
            raise SystemExit("Data Lab Tesla source selected without a path")
        tesla_src=dl/tesla_path
        if not tesla_src.exists():
            raise SystemExit(f"Pinned Data Lab Tesla source missing: {tesla_path}")
        copy_file(tesla_src,out/"runtime/data/tesla_stations.json")
        copy_file(tesla_src,out/"data/tesla_stations.json")
        metadata_path=tesla_cfg.get("metadata")
        if metadata_path:
            metadata_src=dl/metadata_path
            if not metadata_src.exists():
                raise SystemExit(f"Pinned Data Lab Tesla metadata missing: {metadata_path}")
            copy_file(metadata_src,out/"snapshot-inputs/TESLA/suc-tracker-metadata.json")
    # Netherlands: optionally replace the legacy Stable baseline with the
    # immutable national runtime built in Data Lab. The source directory already
    # contains manifest, all.json.gz and tiles; keep its layout under the stable
    # runtime path consumed by the V9 loader.
    nl_cfg=next((d for d in cfg.get("datasets",[]) if d.get("id")=="NL"),{})
    if nl_cfg.get("primarySource")=="dataLab":
        nl_path=nl_cfg.get("path")
        if not nl_path:
            raise SystemExit("Data Lab NL source selected without a path")
        nl_src=dl/nl_path
        if not nl_src.exists():
            raise SystemExit(f"Pinned Data Lab NL source missing: {nl_path}")
        copy_tree(nl_src,out/"runtime/data/non_tesla_netherlands")

    for name in ("manifest.webmanifest","app-version.json","service-worker.js"):
        src=stable/name
        if src.exists():
            copy_file(src,out/name)

    control_dir=out/"control"
    control_dir.mkdir(parents=True,exist_ok=True)
    control_html=(stable/"index.html").read_text(encoding="utf-8")
    if "<base " not in control_html:
        control_html=control_html.replace("<head>","<head>\n<base href=\"../\">",1)
    (control_dir/"index.html").write_text(control_html,encoding="utf-8")

    # The fallback control must stay fallback-only inside the production bundle.
    # Disable its legacy canary bootstrap to avoid redirect loops back to V9.
    update_path=out/"assets/update.js"
    update_text=update_path.read_text(encoding="utf-8")
    update_text=update_text.replace("  loadProductionCanaryBootstrap();","  // Production bundle fallback: legacy canary bootstrap intentionally disabled.")
    update_text=update_text.replace("  window.addEventListener('pageshow',()=>setTimeout(checkForUpdate,150));","  // Immutable production snapshot: automatic stable-PWA update reload disabled.")
    update_text=update_text.replace("  document.addEventListener('visibilitychange',()=>{\n    if(document.visibilityState==='visible')setTimeout(checkForUpdate,150);\n  });","  // Immutable production snapshot: visibility-triggered update reload disabled.")
    update_text=update_text.replace("  window.addEventListener('online',checkForUpdate);","  // Immutable production snapshot: online-triggered update reload disabled.")
    update_text=update_text.replace("  setInterval(checkForUpdate,5*60*1000);","  // Immutable production snapshot: periodic update reload disabled.")
    update_path.write_text(update_text,encoding="utf-8")

    shell_path=out/"v9-production-shell/index.html"
    shell_text=shell_path.read_text(encoding="utf-8")
    # The stable shell embeds a candidate-SHA guard. Keep it aligned with the
    # exact stable commit selected by the immutable snapshot config.
    stable_sha=cfg["sources"]["stable"]["sha"]
    old_guard="8d2c20b7c76004389edd8f4a3b80d6b314900ba0"
    if shell_text.count(old_guard)!=1:
        raise AssertionError(f"stable shell candidate guard count={shell_text.count(old_guard)}; expected exactly one")
    shell_text=shell_text.replace(old_guard,stable_sha,1)
    if old_guard in shell_text or stable_sha not in shell_text:
        raise AssertionError("stable shell candidate guard rewrite was not applied")
    fallback_old="const CONTROL_FALLBACK='../';"
    if fallback_old not in shell_text:
        raise AssertionError("stable shell fallback marker missing")
    shell_text=shell_text.replace(fallback_old,"const CONTROL_FALLBACK='../control/index.html';",1)
    dependency_anchor="'assets/v9/adapters/morocco-public.js','assets/v9/adapters/morocco-kilowatt-tariff.js','assets/v9/browser-loaders.js'"
    if dependency_anchor not in shell_text:
        raise AssertionError("stable shell runtime dependency anchor missing")
    shell_text=shell_text.replace(
        dependency_anchor,
        "'assets/v9/adapters/morocco-public.js','assets/v9/adapters/morocco-kilowatt-tariff.js',"
        "'assets/v9/map-price-engine.js',"
        "'assets/v9/adapters/germany-national.js','assets/v9/adapters/uk-open-feeds.js','assets/v9/adapters/switzerland-avia.js','assets/v9/adapters/italy-ionity-exact.js','assets/v9/adapters/france-ionity-exact.js','assets/v9/adapters/atlante-italy-exact.js','assets/v9/browser-loaders.js',"
        "'assets/v9/production-loader-extension.js','assets/v9/production-bootstrap.js'"
    )
    for required in ("v9-production-shell/bridge.js","assets/v9/production-bootstrap.js","assets/v9/production-loader-extension.js"):
        if required not in shell_text and required!="v9-production-shell/bridge.js":
            raise AssertionError(f"stable shell runtime dependency rewrite missing: {required}")
    shell_path.write_text(shell_text,encoding="utf-8")

    shell_cfg=load_json(stable/"v9-production-shell/shell-config.json")
    shell_cfg.update({
      "mode":"candidate",
      "controlIndex":"../control/index.html",
      "runtimeBase":"runtime",
      "snapshotId":cfg["snapshotId"],
      "observedCandidateSha":cfg["sources"]["stable"]["sha"],
      "engineScopeCountries":["FR","NL","IT","ES","CH","DE","GB","MA"],
      "fallback":"control/index.html",
      "notes":"Production-owned V9 shell. Root enters V9 directly; pinned V7.3 control is local fallback only."
    })
    write_json(out/"v9-production-shell/shell-config.json",shell_cfg)

    root_index="""<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Tesla Charge Companion V9</title>
<script>
(function(){
  var target='v9-production-shell/'+(location.search||'')+(location.hash||'');
  location.replace(target);
})();
</script>
</head>
<body><a href="v9-production-shell/">Ouvrir Tesla Charge Companion V9</a></body>
</html>
"""
    (out/"index.html").write_text(root_index,encoding="utf-8")
    overlays=out/"snapshot-inputs"

    # CH and FR authoritative canonical snapshots newer than legacy runtime.
    pairs=[
      (dl/"data/national/switzerland_public_charging_v9.json", overlays/"CH/switzerland_public_charging_v9.json"),
      (dl/"data/national/france_public_charging_canonical.json", overlays/"FR/france_public_charging_canonical.json"),
    ]
    for src,dst in pairs:
        if src.exists(): copy_file(src,dst)

    # Persist country progress ledgers beside their data so every snapshot is
    # self-describing and auditable.
    ledger_pairs=[
      (dl/"docs/france-cpo-progress-2026-09.json", overlays/"FR/cpo-ledger.json"),
      (dl/"docs/italy-cpo-progress-2026-09.json", overlays/"IT/cpo-ledger.json"),
      (dl/"docs/germany-cpo-progress-2026-09.json", overlays/"DE/cpo-progress.json"),
      (dl/"docs/morocco-cpo-progress-2026-09.json", overlays/"MA/cpo-ledger.json"),
      (dl/"docs/v9-country-progress-2026-09-30.json", overlays/"v9-country-progress.json"),
    ]
    for src,dst in ledger_pairs:
        if src.exists(): copy_file(src,dst)

    national=dl/"data/national"

    # UK: do NOT use inventory/united_kingdom.json (Tesla inventory).
    # The non-Tesla baseline is the validated open-feed aggregate plus exact
    # operator datasets already proven in the canonical CPO ledger.
    uk=overlays/"UK"
    copy_file(national/"uk_validated_open_feeds.json.gz", uk/"all.json.gz")
    for p in national.glob("uk_*"):
        if p.is_file() and p.name != "uk_validated_open_feeds.json.gz":
            copy_file(p,uk/"sources"/p.name)
    for name in ("fastned_direct_stations_uk.json.gz","ionity_direct_stations_uk.json.gz"):
        p=national/name
        if p.exists(): copy_file(p,uk/"sources"/name)
    copy_file(dl/"docs/uk-cpo-progress-2026-09.json", uk/"cpo-ledger.json")
    uk_ledger=load_json(dl/"docs/uk-cpo-progress-2026-09.json")
    uk_rows=uk_ledger.get("cpos") or []
    def uk_bucket(status):
        s=str(status or "").lower()
        if s.startswith("complete") or s.startswith("coverage_platform_scope_not_cpo"): return "complete"
        if s.startswith("partial"): return "partial"
        if s.startswith("set_aside") or s.startswith("blocked_external"): return "setAside"
        return "other"
    counts={"complete":0,"partial":0,"setAside":0,"other":0}
    for row in uk_rows: counts[uk_bucket(row.get("status"))]+=1
    write_json(uk/"manifest.json",{
      "schemaVersion":1,
      "country":"GB",
      "coverage":"partial",
      "primaryFile":"all.json.gz",
      "canonicalCpoCount":len(uk_rows),
      "cpoStatusCounts":counts,
      "firstPassComplete":bool((uk_ledger.get("firstPass") or {}).get("countryFirstPassComplete")),
      "policy":"Validated open/operator feeds only. Missing operators or tariffs remain fail-closed.",
      "sourceLedger":"cpo-ledger.json"
    })

    # Morocco: CPO-consolidated production pack. Keep operator datasets separate
    # because overlaps must be reconciled by canonical IDs, not summed.
    ma=overlays/"MA"
    ma_sources=[
      ("EVGO","reports/morocco/evgo/latest-production-stations.json","evgo-production.json"),
      ("FastVolt","reports/morocco/fastvolt/latest-public-map-inventory.json","fastvolt-public-map.json"),
      ("FastVolt tariff","reports/morocco/fastvolt/tariff-reconciliation-2026-08-31.json","fastvolt-tariff-policy.json"),
      ("Kilowatt inventory","reports/morocco/kilowatt/latest-public-station-inventory.json","kilowatt-public-station-inventory.json"),
      ("Kilowatt native","reports/morocco/kilowatt/latest-native-connector-tariffs.json","kilowatt-native-tariffs.json"),
      ("Kilowatt overlay","reports/morocco/kilowatt/latest-v9-tariff-overlay-manifest.json","kilowatt-tariff-overlay.json"),
      ("EVOne policy","reports/morocco/evone/production-status-policy.json","evone-status-policy.json"),
      ("TotalEnergies native","reports/morocco/totalenergies/latest-native-overlay.json","totalenergies-native-overlay.json"),
    ]
    present=[]
    for label,src_rel,dst_name in ma_sources:
        src=dl/src_rel
        if src.exists():
            copy_file(src,ma/"sources"/dst_name)
            present.append({"label":label,"file":"sources/"+dst_name})
    write_json(ma/"manifest.json",{
      "schemaVersion":1,
      "country":"MA",
      "coverage":"partial-cpo-consolidated",
      "sources":present,
      "knownSourceCounts":{
        "EVGO":{"stations":17,"evses":43},
        "FastVolt":{"productionCandidates":97},
        "Kilowatt":{"productionStations":43,"tariffResolvedStations":43},
        "TotalEnergies":{"stations":18,"connectors":38,"pricedConnectors":38,"liveStatusConnectors":38}
      },
      "deduplication":"Do not sum source station counts. Canonical identity reconciliation is required across CPO/access-network overlaps.",
      "policy":"Publish validated CPO stations and exact tariffs only; unresolved operators and tariff components remain fail-closed."
    })

    # France validated direct/platform overlays beside the canonical baseline.
    fr_direct=overlays/"FR/direct"
    fr_direct.mkdir(parents=True,exist_ok=True)
    for name in ("atlante_direct_stations_france_latest.json.gz","ionity_direct_stations_france.json.gz"):
        p=national/name
        if p.exists(): copy_file(p,fr_direct/name)
    ionity_fr_exact=dl/"data/operator_direct/ionity_exact_france.json"
    if ionity_fr_exact.exists():
        copy_file(ionity_fr_exact,fr_direct/"ionity_exact_france.json")
    ev_inventory=dl/"data/electroverse/inventory/france-current.json"
    ev_delta=dl/"reports/electroverse/daily-delta.json"
    if ev_inventory.exists(): copy_file(ev_inventory,overlays/"FR/platforms/electroverse-france-current.json")
    if ev_delta.exists(): copy_file(ev_delta,overlays/"FR/platforms/electroverse-daily-delta.json")
    ev_cache=dl/"data/electroverse/tariff_cache"
    ev_manifest=ev_cache/"manifest.json"
    if ev_manifest.exists():
        subprocess.run([
          sys.executable,
          str(production_root/"scripts/build_electroverse_runtime_offers.py"),
          "--cache-dir",str(ev_cache),
          "--manifest",str(ev_manifest),
          "--national",str(out/"runtime/data/v9/france-static/all.json.gz"),
          "--mapping",str(dl/"data/electroverse/irve_location_mapping.json"),
          "--out",str(overlays/"FR/platforms/electroverse-runtime-offers.json")
        ],check=True)

    # Electra eMSP aggregate overlay is independent from Electroverse and
    # uses pinned national EVSE identities or validated curated IRVE locations.
    electra_platform=dl/"data/platforms/electra/france"
    electra_manifest=electra_platform/"manifest.json"
    if electra_manifest.exists():
        em=load_json(electra_manifest)
        assert em.get("policy",{}).get("nationalFranceIsIdentityHub") is True
        ep=em.get("policy",{})
        if ep.get("exactNationalEvseOnly") is not True:
            assert set(ep.get("acceptedIdentityModes") or []) == {
                "exact_national_irve_evse", "curated_irve_location"
            }
            assert ep.get("curatedMatchRequiresValidatedDistanceNameAddressPowerAndConnectorEvidence") is True
        assert em.get("policy",{}).get("electroverseDependency") is False
        assert int((em.get("stats") or {}).get("publishedOffers") or 0) > 0
        copy_tree(electra_platform,overlays/"FR/platforms/electra")
        reg=load_json(registry)
        for src in reg.get("sources",[]):
            if src.get("id")=="france-electra-platform":
                src["active"]=True
                src["optional"]=False
                src.pop("disabledReason",None)
                src["refresh"]="immutable-production-snapshot"
                break
        else:
            raise AssertionError("france-electra-platform registry source missing")
        prod=reg.setdefault("productionIntegration",{})
        local=prod.setdefault("snapshotLocalSources",[])
        if "france-electra-platform" not in local:
            local.append("france-electra-platform")
        write_json(registry,reg)

    # Italy validated direct overlays beside the compiled static baseline.
    it_dst=overlays/"IT/direct"
    it_dst.mkdir(parents=True,exist_ok=True)
    for p in national.glob("*italy*"):
        if p.is_file(): copy_file(p,it_dst/p.name)
    ionity_it_reconciliation=dl/"data/reports/ionity_italy_exact_reconciliation_20260923.json"
    if ionity_it_reconciliation.exists():
        copy_file(ionity_it_reconciliation,it_dst/"ionity_italy_exact_reconciliation_20260923.json")

    # Germany validated direct overlays complement the pinned national base.
    de_direct=overlays/"DE/direct"
    de_direct.mkdir(parents=True,exist_ok=True)
    for name in ("ionity_direct_stations_germany.json.gz",):
        p=national/name
        if p.exists(): copy_file(p,de_direct/name)

    # Switzerland validated operator evidence alongside the canonical overlay.
    avia_src=dl/"data/switzerland/avia-guest-direct-tariffs.json"
    avia_rec=dl/"docs/switzerland-avia-guest-reconciliation-2026-09-29.json"
    if avia_src.exists(): copy_file(avia_src,overlays/"CH/direct/avia-guest-direct-tariffs.json")
    if avia_rec.exists(): copy_file(avia_rec,overlays/"CH/direct/avia-reconciliation.json")

    # Germany national BNetzA/AFIR baseline + current resolution ledger.
    # Prefer the durable Data Lab copy. The optional Actions artifact is now
    # only a backward-compatible fallback for historical snapshot configs.
    durable_catalog=national/"germany_non_tesla_catalog_staging_direct_cpo.json.gz"
    durable_manifest=national/"germany_non_tesla_catalog_staging_direct_cpo_manifest.json"
    if durable_catalog.exists() and durable_manifest.exists():
        catalog=durable_catalog
        source_manifest=durable_manifest
    elif a.germany_source:
        de_src=pathlib.Path(a.germany_source)
        catalog=de_src/"germany_non_tesla_catalog_staging_direct_cpo.json.gz"
        source_manifest=de_src/"germany_non_tesla_catalog_staging_direct_cpo_manifest.json"
    else:
        catalog=source_manifest=None
    if catalog is not None:
        assert catalog.exists() and source_manifest.exists(), "Germany source baseline incomplete"
        de=overlays/"DE"
        copy_file(catalog,de/"all.json.gz")
        copy_file(source_manifest,de/"national-source-manifest.json")
        subprocess.run([
          sys.executable,
          str(production_root/"scripts/build_germany_runtime_tiles.py"),
          str(de/"all.json.gz"),
          str(de/"tiles")
        ],check=True)
        dl_ledger=dl/"docs/germany-cpo-second-pass-resolution-180.json"
        prod_ledger=pathlib.Path("docs/source-ledgers/germany-cpo-second-pass-resolution-180.json")
        ledger_src=dl_ledger if dl_ledger.exists() else prod_ledger
        copy_file(ledger_src,de/"resolution-ledger.json")
        de_ionity=national/"ionity_direct_stations_germany.json.gz"
        if de_ionity.exists():
            copy_file(de_ionity,de/"direct/ionity_direct_stations_germany.json.gz")
            subprocess.run([
              sys.executable,
              str(production_root/"scripts/build_germany_ionity_inventory_supplement.py"),
              str(dl),
              str(de/"direct/ionity_isolated_unpriced_supplement.json")
            ],check=True)
        m=load_json(source_manifest)
        ledger=load_json(ledger_src)
        assert m["stats"]["nonTeslaSites"] == 63405
        assert m["stats"]["directCpoSites"] == 5471
        assert ledger["canonicalAfter"] == {"totalNamedCpos":591,"complete":244,"partial":347,"blocked":0}
        write_json(de/"manifest.json",{
          "schemaVersion":1,
          "country":"DE",
          "coverage":"partial",
          "primaryFile":"all.json.gz",
          "stationCount":m["stats"]["nonTeslaSites"],
          "directCpoPricedSites":m["stats"]["directCpoSites"],
          "cpoStatus":ledger["canonicalAfter"],
          "policy":"National station baseline is publishable; only validated direct/EVSE pricing is applied. Residual tariffs remain fail-closed."
        })

    # One common route table for the Worker/R2 runtime. This preserves existing
    # validated country formats while giving the frontend one stable discovery contract.
    contract={
      "schemaVersion":1,
      "snapshotId":cfg["snapshotId"],
      "policy":cfg["policy"],
      "deployment":{
        "rootIndex":"index.html",
        "shell":"v9-production-shell/index.html",
        "shellConfig":"v9-production-shell/shell-config.json",
        "controlFallback":"control/index.html",
        "runtimeBase":"runtime",
        "engineScopeCountries":["FR","NL","IT","ES","CH","DE","GB","MA"]
      },
      "runtimeIntegration":{
        "registry":"runtime/data/v9/source-registry.json",
        "scripts":[
          "runtime/assets/v9/adapters/germany-national.js",
          "runtime/assets/v9/adapters/uk-open-feeds.js",
          "runtime/assets/v9/adapters/switzerland-avia.js",
          "runtime/assets/v9/adapters/italy-ionity-exact.js",
          "runtime/assets/v9/adapters/france-ionity-exact.js",
          "runtime/assets/v9/adapters/atlante-italy-exact.js",
          "runtime/assets/v9/production-loader-extension.js",
          "runtime/assets/v9/map-price-engine.js",
          "runtime/assets/v9/production-bootstrap.js"
        ],
        "loaderExtensionInstall":"TCCV9ProductionBootstrap.install()"
      },
      "datasets":{
        "TESLA":{"kind":"tesla","entry":"runtime/data/tesla_stations.json","coverage":"current","primarySource":tesla_cfg.get("primarySource","stable"),"sourceMetadata":"snapshot-inputs/TESLA/suc-tracker-metadata.json" if tesla_cfg.get("primarySource")=="dataLab" else None},
        "ES":{"kind":"static-tiles","manifest":"runtime/data/v9/spain-static/manifest.json","offers":"runtime/data/v9/spain-reve-offers/manifest.json","coverage":"complete"},
        "NL":{"kind":"static-tiles","manifest":"runtime/data/non_tesla_netherlands/manifest.json","coverage":"complete"},
        "CH":{"kind":"canonical-overlay","manifest":"runtime/data/v9/switzerland-static/manifest.json","canonical":"snapshot-inputs/CH/switzerland_public_charging_v9.json","direct":"snapshot-inputs/CH/direct","coverage":"complete-with-fail-closed-residuals"},
        "MA":{"kind":"cpo-consolidated","manifest":"snapshot-inputs/MA/manifest.json","coverage":"partial"},
        "FR":{"kind":"canonical-overlay","manifest":"runtime/data/v9/france-static/manifest.json","canonical":"snapshot-inputs/FR/france_public_charging_canonical.json","direct":"snapshot-inputs/FR/direct","platforms":"snapshot-inputs/FR/platforms","identityHub":"national France station/EVSE baseline","coverage":"partial"},
        "IT":{"kind":"static-tiles","manifest":"runtime/data/v9/italy-static/manifest.json","offers":"runtime/data/v9/italy-offers.json","direct":"snapshot-inputs/IT/direct","coverage":"partial"},
        "DE":{"kind":"national-baseline","manifest":"snapshot-inputs/DE/manifest.json","all":"snapshot-inputs/DE/all.json.gz","direct":"snapshot-inputs/DE/direct","coverage":"partial"},
        "UK":{"kind":"validated-open-feeds","manifest":"snapshot-inputs/UK/manifest.json","all":"snapshot-inputs/UK/all.json.gz","coverage":"partial"}
      }
    }
    write_json(out/"runtime-contract.json",contract)

    files=[]
    for p in out.rglob("*"):
        if p.is_file():
            files.append({"path":str(p.relative_to(out)),"bytes":p.stat().st_size,"sha256":sha256(p)})
    manifest={
      "schemaVersion":1,
      "snapshotId":cfg["snapshotId"],
      "policy":cfg["policy"],
      "sources":cfg["sources"],
      "datasets":cfg["datasets"],
      "runtimeContract":"runtime-contract.json",
      "fileCount":len(files),
      "bytes":sum(x["bytes"] for x in files),
      "files":files
    }
    write_json(out/"manifest.json",manifest)
    print(json.dumps({"snapshotId":cfg["snapshotId"],"fileCount":len(files),"bytes":manifest["bytes"]}))

if __name__=="__main__":
    main()
