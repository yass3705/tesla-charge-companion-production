#!/usr/bin/env python3
import argparse
import gzip
import hashlib
import json
import pathlib
import shutil
import subprocess
import sys
from tesla_tariff_priority import build_selected_catalogue

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
    # Apply the scoped OCPI 2.2.1 first-match/segmentation fix to the
    # immutable compiled pricing runtime; other tariffs retain their rules.
    subprocess.run([
        sys.executable,
        str(production_root/"scripts/patch_ocpi_pcpr_pricing.py"),
        str(out/"runtime/assets/v9/pricing-engine.js")
    ],check=True)
    registry=out/"runtime/data/v9/source-registry.json"
    subprocess.run([sys.executable,str(production_root/"scripts/build_runtime_registry.py"),str(registry)],check=True)

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
    elif tesla_cfg.get("primarySource")=="stable" and tesla_cfg.get("path")=="data/tesla_stations.json":
        mac_source=stable/"data/tesla_stations.json"
        if not mac_source.exists():
            raise SystemExit("Pinned Stable Mac Tesla catalogue missing")
        if tesla_cfg.get("tariffPolicy")=="mac-country-10-days":
            suc_source=dl/tesla_cfg["sucPath"]
            suc_meta=dl/tesla_cfg["sucMetadata"]
            updates=production_root/"data/tesla_mac_country_updates.json"
            if not suc_source.exists() or not suc_meta.exists() or not updates.exists():
                raise SystemExit("Pinned Tesla tariff policy input missing")
            report=out/"snapshot-inputs/TESLA/tariff-selection.json"
            build_selected_catalogue(mac_source,suc_source,updates,cfg["teslaTariffAsOfDate"],
                                     out/"runtime/data/tesla_stations.json",report)
            copy_file(out/"runtime/data/tesla_stations.json",out/"data/tesla_stations.json")
            copy_file(mac_source,out/"snapshot-inputs/TESLA/mac-stations.json")
            copy_file(suc_meta,out/"snapshot-inputs/TESLA/suc-tracker-metadata.json")
            copy_file(updates,out/"snapshot-inputs/TESLA/mac-country-updates.json")
        else:
            copy_file(mac_source,out/"runtime/data/tesla_stations.json")
            if (out/"data/tesla_stations.json").read_bytes()!=mac_source.read_bytes():
                raise AssertionError("Control and V9 Tesla catalogues differ")
        comparison=production_root/"docs/tesla-mac-suc-comparison-2026-10-07.json"
        if comparison.exists(): copy_file(comparison,out/"snapshot-inputs/TESLA/mac-suc-comparison.json")
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
        # DOT-NL is loaded from snapshot-inputs by the dedicated adapter; avoid duplicate inventory.

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
        "'assets/v9/adapters/germany-national.js','assets/v9/adapters/netherlands-dotnl.js','assets/v9/adapters/belgium-nap.js','assets/v9/adapters/uk-open-feeds.js','assets/v9/adapters/switzerland-avia.js','assets/v9/adapters/italy-ionity-exact.js','assets/v9/adapters/france-ionity-exact.js','assets/v9/adapters/atlante-italy-exact.js','assets/v9/browser-loaders.js',"
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
      "engineScopeCountries":["FR","NL","IT","ES","CH","DE","GB","MA","BE"],
      "fallback":"control/index.html",
      "notes":"Production-owned V9 shell. Root enters V9 directly; pinned V7.3 control is local fallback only."
    })
    if not any(d.get("id")=="BE" for d in cfg.get("datasets",[])):
        shell_cfg["engineScopeCountries"].remove("BE")
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

    # Netherlands DOT-NL compiled national runtime. Keep it as a normal
    # country dataset; Tesla rows are excluded by the registry rule.
    nl_src=dl/"data/national/netherlands_dotnl/runtime"
    if nl_cfg.get("primarySource")=="dataLab":
        if not nl_src.exists():
            raise SystemExit("Current DOT-NL national base missing")
        copy_tree(nl_src,overlays/"NL/runtime")
        nl_manifest=load_json(overlays/"NL/runtime/manifest.json")
        write_json(overlays/"NL/manifest.json",{
          "schemaVersion":1,
          "country":"NL",
          "coverage":"partial-fail-closed",
          "primaryFile":"runtime/all.json.gz",
          "stationCount":nl_manifest.get("stationCount"),
          "configurationCount":nl_manifest.get("configurationCount"),
          "pricedConfigurationCount":nl_manifest.get("pricedConfigurationCount"),
          "tileCount":nl_manifest.get("tileCount"),
          "policy":"DOT-NL compiled runtime; unsupported and non-direct tariff configurations remain fail-closed.",
          "sourceManifest":"runtime/manifest.json"
        })

    # Belgium Eco-Movement NAP selected-CPO pages. The source manifest keeps
    # the complete first-pass inventory and the runtime adapter normalizes each
    # page on demand; unresolved operator tariffs stay fail-closed.
    be_manifest_src=dl/"data/belgium/nap-belgium-manifest.json"
    be=overlays/"BE"
    if any(d.get("id")=="BE" for d in cfg.get("datasets",[])):
        if not be_manifest_src.exists():
            raise SystemExit("Current Belgium NAP baseline missing")
        copy_file(be_manifest_src,be/"manifest.json")
        for page in sorted((dl/"data/belgium/pages").glob("nap-belgium-*.json.gz")):
            copy_file(page,be/"pages"/page.name)
        be_progress=dl/"docs/belgium-cpo-progress-2026-09.json"
        be_gap=dl/"reports/belgium/belgium-final-gap-reconciliation-2026-09-28.json"
        if be_progress.exists(): copy_file(be_progress,be/"cpo-ledger.json")
        if be_gap.exists(): copy_file(be_gap,be/"gap-reconciliation.json")
        be_meta=load_json(be_progress) if be_progress.exists() else {}
        write_json(be/"runtime-manifest.json",{
          "schemaVersion":1,
          "country":"BE",
          "coverage":"partial-selected-cpo",
          "primaryFile":"manifest.json",
          "locations":(be_meta.get("firstPass") or {}).get("locations"),
          "evses":(be_meta.get("firstPass") or {}).get("evses"),
          "operatorsSeen":(be_meta.get("firstPass") or {}).get("operatorsSeen"),
          "cpoStatusCounts":be_meta.get("counts"),
          "policy":"Eco-Movement selected-CPO NAP baseline with exact tariff records; missing operators and unresolved prices remain fail-closed."
        })

    # Activate the up-to-date national baselines and suppress historic NL inventory.
    if nl_cfg.get("primarySource")=="dataLab" or any(d.get("id")=="BE" for d in cfg.get("datasets",[])):
        current_registry=load_json(registry)
        for source in current_registry.get("sources",[]):
            if source.get("id")=="netherlands-dotnl-national" and nl_cfg.get("primarySource")=="dataLab":
                source["active"]=True
                source["optional"]=False
            elif source.get("id")=="belgium-nap-national" and any(d.get("id")=="BE" for d in cfg.get("datasets",[])):
                source["active"]=True
                source["optional"]=False
            elif source.get("id") in ("netherlands-dotnl","netherlands-direct-offers") and nl_cfg.get("primarySource")=="dataLab":
                source["active"]=False
        local=current_registry.setdefault("productionIntegration",{}).setdefault("snapshotLocalSources",[])
        for identifier in ("netherlands-dotnl-national","belgium-nap-national"):
            if next((a for a in current_registry.get("sources",[]) if a.get("id")==identifier and a.get("active")),None) and identifier not in local:
                local.append(identifier)
        write_json(registry,current_registry)

    # UK: do NOT use inventory/united_kingdom.json (Tesla inventory).
    # The non-Tesla baseline is the validated open-feed aggregate plus exact
    # operator datasets already proven in the canonical CPO ledger.
    uk=overlays/"UK"
    copy_file(national/"uk_validated_open_feeds.json.gz", uk/"all.json.gz")
    for p in national.glob("uk_*"):
        if p.is_file() and p.name not in {"uk_validated_open_feeds.json.gz","uk_gridserve_pcpr_locations.json.gz","uk_gridserve_pcpr_tariffs.json.gz"}:
            copy_file(p,uk/"sources"/p.name)
    for name in ("fastned_direct_stations_uk.json.gz","ionity_direct_stations_uk.json.gz"):
        p=national/name
        if p.exists(): copy_file(p,uk/"sources"/name)
    # Activate the Ubitricity runtime source only for a pinned, internally
    # consistent validated artifact. Older snapshots remain buildable.
    ubi_data=uk/"sources/uk_ubitricity_v9.json.gz"
    ubi_report=dl/"reports/uk/ubitricity-pcpr-validation-latest.json"
    if ubi_data.exists() and ubi_report.exists():
        with gzip.open(ubi_data,"rt",encoding="utf-8") as f: ubi_payload=json.load(f)
        report=load_json(ubi_report)
        source=next((s for s in ubi_payload.get("sources",[]) if s.get("id")=="ubitricity-pcpr-payg"),None)
        if not source or len(ubi_payload.get("sources",[]))!=1 or report.get("collectedAt")!=ubi_payload.get("collectedAt"):
            raise AssertionError("Ubitricity source/report identity mismatch")
        locations=source.get("locations") or []
        connectors=[c for loc in locations for evse in loc.get("evses",[]) for c in evse.get("connectors",[])]
        priced=sum(bool(c.get("validatedV9Offer")) for c in connectors)
        if (len(locations)!=report.get("locations") or len(connectors)!=report.get("connectors")
            or priced!=report.get("pricedConnectors") or priced==0
            or priced+report.get("unpricedConnectors",0)!=len(connectors)):
            raise AssertionError("Ubitricity V9 coverage/report mismatch")
        current_registry=load_json(registry)
        ubi_registry=next(s for s in current_registry["sources"] if s.get("id")=="uk-ubitricity-pcpr-payg")
        ubi_registry["active"]=True
        ubi_registry["optional"]=False
        current_registry["productionIntegration"]["snapshotLocalSources"].append("uk-ubitricity-pcpr-payg")
        write_json(registry,current_registry)
    # UK Midhope Road: independent 4-connector first-party screenshot-backed
    # offer. Do NOT activate the general Connected Kerb unverified candidate.
    ck_data=uk/"sources/uk_connected_kerb_midhope_verified_v9.json.gz"
    ck_report=dl/"reports/uk/connected-kerb-midhope-runtime-stage-2026-10-10.json"
    if ck_data.exists() and ck_report.exists():
        with gzip.open(ck_data,"rt",encoding="utf-8") as f: ck_payload=json.load(f)
        ck_summary=load_json(ck_report)
        ck_sources=ck_payload.get("sources") or []
        if len(ck_sources)!=1 or ck_sources[0].get("id")!="connected-kerb-midhope-guest-verified":
            raise AssertionError("Midhope CPO source identity mismatch")
        ck_locations=ck_sources[0].get("locations") or []
        ck_evses=[e for loc in ck_locations for e in loc.get("evses",[])]
        ck_conns=[(loc,e,c) for loc in ck_locations for e in loc.get("evses",[]) for c in e.get("connectors",[])]
        if (len(ck_locations)!=1 or len(ck_evses)!=4 or len(ck_conns)!=4
            or ck_summary.get("exactConnectorCount")!=4
            or ck_summary.get("stationId")!="cd20ba89-4241-4b39-b738-514f49093e8d"
            or any(loc.get("publish") is not True or loc.get("id")!=ck_summary["stationId"] for loc in ck_locations)
            or set(ck_summary.get("evseIds") or [])!={e.get("evse_id") for e in ck_evses}
            or set(ck_summary.get("connectorIds") or [])!={c.get("id") for _,_,c in ck_conns}
            or any(c.get("validatedV9Offer",{}).get("pricing",{}).get("verifiedSourceVersion")!="2026-10-10-midhope-exact-4" for _,_,c in ck_conns)
            or any(c.get("validatedV9Offer",{}).get("validThrough")!="2026-10-24" for _,_,c in ck_conns)):
            raise AssertionError("Midhope 4 EVSE public exact connector tariff proof failed")
        current_registry=load_json(registry)
        ck_entry=next(a for a in current_registry["sources"] if a.get("id")=="uk-connected-kerb-midhope-guest-verified")
        ck_entry["active"]=True
        ck_entry["optional"]=False
        locallist=current_registry.setdefault("productionIntegration",{}).setdefault("snapshotLocalSources",[])
        if ck_entry["id"] not in locallist:locallist.append(ck_entry["id"])
        write_json(registry,current_registry)
    # Gridserve: only activate the exact, independently audited public subset.
    # Never expose the raw PCPR locations (which include depots, testing and retired sites).
    grid_data=uk/"sources/uk_gridserve_v9.json.gz"
    grid_report=dl/"reports/uk/gridserve-v9-integration-latest.json"
    if grid_data.exists() and grid_report.exists():
        with gzip.open(grid_data,"rt",encoding="utf-8") as f: grid_payload=json.load(f)
        verified=load_json(grid_report)
        sources=grid_payload.get("sources") or []
        if len(sources)!=1 or sources[0].get("id")!="gridserve-pcpr-direct":
            raise AssertionError("Gridserve runtime source identity mismatch")
        if verified.get("status")!="validated_public_connector_exact" or verified.get("validatedForV9") is not True:
            raise AssertionError("Gridserve public-only validation missing")
        if grid_payload.get("collectedAt")!=verified.get("collectedAt"):
            raise AssertionError("Gridserve public-only dataset / audit timestamp mismatch")
        grid_locs=sources[0].get("locations") or []
        grid_tariffs={str(t.get("id")):t for t in sources[0].get("tariffs") or []}
        if len(grid_locs)!=verified.get("publicLocations") or len(grid_tariffs)!=verified.get("distinctExactTariffIds"):
            raise AssertionError("Gridserve public location / tariff coverage mismatch")
        public_connectors=priced=0
        for loc in grid_locs:
            if loc.get("publish") is not True or str(loc.get("country_code"))!="GB":
                raise AssertionError("Unpublished / non-GB Gridserve site in V9")
            for evse in loc.get("evses") or []:
                if str(evse.get("status")).upper()=="REMOVED":
                    raise AssertionError("Retired Gridserve EVSE in V9")
                for conn in evse.get("connectors") or []:
                    public_connectors+=1
                    tids=conn.get("tariff_ids") or []
                    if any(str(tid) not in grid_tariffs for tid in tids):
                        raise AssertionError("Gridserve connector with unresolved tariff")
                    priced+=bool(tids)
        if (len(grid_locs)<100 or public_connectors!=verified.get("publicConnectors")
            or priced!=verified.get("exactPricedConnectors")
            or public_connectors!=priced+verified.get("unpricedPublicConnectors",0)
            or verified.get("publicUnmappedTariffReferences")):
            raise AssertionError("Gridserve public-only exact connector integrity regression")
        current_registry=load_json(registry)
        grid_source=next(s for s in current_registry["sources"] if s.get("id")=="uk-gridserve-pcpr-direct")
        grid_source["active"]=True
        grid_source["optional"]=False
        local=current_registry["productionIntegration"].setdefault("snapshotLocalSources",[])
        if "uk-gridserve-pcpr-direct" not in local:local.append("uk-gridserve-pcpr-direct")
        write_json(registry,current_registry)
    # ChargePoint/Eco-Movement PCPR direct CPO feed. No eMSP rates, no tariff
    # inheritance from station to EVSE: match only per-connector tariff_ids.
    eco_src=uk/"sources/uk_eco_movement_pcpr_v9.json.gz"
    eco_report=dl/"reports/uk/eco-movement-pcpr-v9-staging.json"
    # Source audit has 1,035 arithmetically staged connector prices, but
    # direct guest checkout/VAT is not validated. Do not activate or abort
    # unrelated verified sources: leave this registry entry inactive.
    if eco_src.exists() and eco_report.exists() and load_json(eco_report).get("readyForTariffRanking") is True:
        report=load_json(eco_report)
        with gzip.open(eco_src,"rt",encoding="utf-8") as f:
            payload=json.load(f)
        sources=payload.get("sources") or []
        if (len(sources)!=1 or sources[0].get("id")!="eco-movement-pcpr-cpo-direct"
            or payload.get("integrationStatus")!="cpo_direct_exact_connector_vat_inclusive"
            or payload.get("collectedAt")!=report.get("sourceCollectedAt")
            or report.get("integrationStatus")!=payload.get("integrationStatus")
            or report.get("readyForTariffRanking") is not True):
            raise AssertionError("ChargePoint PCPR validated CPO source/report mismatch")
        source=sources[0]
        locs=source.get("locations") or []
        tariff_rows=source.get("tariffs") or []
        tariff_ids=[str(t.get("id")) for t in tariff_rows]
        tariff_set=set(tariff_ids)
        if len(tariff_ids)!=len(tariff_set) or not tariff_set:
            raise AssertionError("PCPR tariffs absent or duplicated")
        if any(t.get("currency")!="GBP" or t.get("tccPriceBasis")!="GBP_including_public_UK_VAT" for t in tariff_rows):
            raise AssertionError("PCPR price currency/VAT not safe")
        if any(loc.get("publish") is not True or str(loc.get("country")) not in ("GBR","GB") for loc in locs):
            raise AssertionError("PCPR private/outside-UK location")
        connectors=[c for loc in locs for evse in loc.get("evses",[]) for c in evse.get("connectors",[])]
        priced=sum(bool(c.get("tariff_ids")) for c in connectors)
        if (not locs or len(locs)!=report.get("stagedPublicLocations")
            or len(connectors)!=report.get("stagedConnectors")
            or priced!=report.get("stagedRankableDirectOffers")
            or priced<=0 or priced+report.get("stagedUnpricedConnectors",0)!=len(connectors)
            or sum(len(c.get("sourceTariffIds",[])) for c in connectors)!=report.get("sourceTariffReferencesPreserved")
            or any(tid not in tariff_set for conn in connectors for tid in conn.get("tariff_ids",[]))):
            raise AssertionError("PCPR exact connector tariff mapping invalid")
        reg=load_json(registry)
        entry=next((s for s in reg.get("sources",[]) if s.get("id")=="uk-eco-movement-pcpr-cpo-direct"),None)
        if entry is None: raise AssertionError("PCPR V9 registry source missing")
        entry["active"]=True
        entry["optional"]=False
        local=reg.setdefault("productionIntegration",{}).setdefault("snapshotLocalSources",[])
        if entry["id"] not in local:local.append(entry["id"])
        write_json(registry,reg)
    # Blink: require independent Data Lab report and strict public exact connector
    # integrity; fail closed on missing tariff, wrong CPO or wrong VAT basis.
    blink_data=uk/"sources/uk_blink_pcpr_v9.json.gz"
    blink_report=dl/"reports/uk/blink-pcpr-validation-latest.json"
    if blink_data.exists() and blink_report.exists():
        with gzip.open(blink_data,"rt",encoding="utf-8") as f:
            blink_payload=json.load(f)
        audited=load_json(blink_report)
        blink_sources=blink_payload.get("sources") or []
        if (len(blink_sources)!=1 or blink_sources[0].get("id")!="blink-uk-pcpr-direct"
            or blink_payload.get("country")!="GB"
            or blink_payload.get("collectedAt")!=audited.get("collectedAt")
            or audited.get("status")!="validated_public_exact_connector"
            or audited.get("validatedForV9") is not True
            or audited.get("provider")!="Blink Charging"):
            raise AssertionError("Blink PCPR independently audited source mismatch")
        blink_source=blink_sources[0]
        blink_locations=blink_source.get("locations") or []
        blink_tariffs=blink_source.get("tariffs") or []
        blink_tariff_ids=[str(t.get("id") or "") for t in blink_tariffs]
        blink_by_id={str(t.get("id")):t for t in blink_tariffs}
        if (not blink_locations or len(blink_locations)!=audited.get("publicLocations")
            or not blink_tariffs or len(blink_tariffs)!=audited.get("distinctTariffs")
            or not all(blink_tariff_ids) or len(set(blink_tariff_ids))!=len(blink_tariff_ids)
            or any(t.get("currency")!="GBP" or t.get("tccPriceBasis")!="GBP_including_public_UK_VAT"
                   for t in blink_tariffs)):
            raise AssertionError("Blink UK tariff or source coverage regression")
        blink_connector_count=blink_priced=0
        blink_seen=set()
        for loc in blink_locations:
            op=(loc.get("operator") or {}).get("name","")
            if (loc.get("publish") is not True or loc.get("country_code")!="GB"
                or "blink" not in op.lower()):
                raise AssertionError("Blink non-public or cross-CPO inventory")
            for evse in loc.get("evses") or []:
                if str(evse.get("status") or "").upper()=="REMOVED":
                    raise AssertionError("Blink removed EVSE leaked into V9")
                for conn in evse.get("connectors") or []:
                    ck=(loc.get("id"),evse.get("evse_id") or evse.get("uid"),conn.get("id"))
                    if ck in blink_seen or not all(ck):
                        raise AssertionError("Duplicate or missing Blink connector key")
                    blink_seen.add(ck)
                    blink_connector_count+=1
                    tids=[str(t) for t in conn.get("tariff_ids") or []]
                    if any(t not in blink_by_id
                           or blink_by_id[t].get("party_id")!=loc.get("party_id")
                           for t in tids):
                        raise AssertionError("Blink unresolved/cross-CPO connector tariff")
                    blink_priced+=bool(tids)
        if (blink_connector_count!=audited.get("publicConnectors")
            or blink_priced!=audited.get("exactPricedConnectors")
            or blink_connector_count-blink_priced!=audited.get("unpricedPublicConnectors")
            or blink_priced==0):
            raise AssertionError("Blink audited connector price counts mismatch")
        reg=load_json(registry)
        entry=next((s for s in reg.get("sources",[]) if s.get("id")=="uk-blink-pcpr-direct"),None)
        if entry is None:
            raise AssertionError("Missing Blink V9 registry entry")
        entry["active"]=True
        entry["optional"]=False
        local=reg.setdefault("productionIntegration",{}).setdefault("snapshotLocalSources",[])
        if entry["id"] not in local:local.append(entry["id"])
        write_json(registry,reg)
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
    # Electroverse tariffs are compiled at EVSE granularity in Data Lab.
    # Consume those rich rule payloads directly; the legacy station flattener
    # discarded complex and heterogeneous tariffs and is intentionally bypassed.
    evse_overlay=dl/"data/platforms/electroverse/france-evse"
    evse_manifest=evse_overlay/"manifest.json"
    if not evse_manifest.exists():
        raise SystemExit("Pinned Electroverse EVSE tariff overlay is missing; refusing legacy complex-tariff exclusions")
    evse_meta=load_json(evse_manifest)
    evse_stats=evse_meta.get("stats") or {}
    if int(evse_stats.get("publishedOffers") or 0)<5000:
        raise SystemExit("Pinned Electroverse EVSE overlay has incomplete tariff coverage")
    copy_tree(evse_overlay,overlays/"FR/platforms/electroverse")
    # Preserve the complete Electroverse source cache and mapping inputs. The
    # compiled EVSE tariff tiles are an enrichment; they must never become the
    # only representation of the overlay.
    ev_source=dl/"data/electroverse/tariff_cache"
    ev_mapping=dl/"data/electroverse/irve_location_mapping.json"
    if ev_source.exists(): copy_tree(ev_source,overlays/"FR/platforms/electroverse-source/tariff_cache")
    if ev_mapping.exists(): copy_file(ev_mapping,overlays/"FR/platforms/electroverse-source/irve_location_mapping.json")
    write_json(overlays/"FR/platforms/electroverse-source/README.json",{
      "dataset":"Electroverse France complete source overlay",
      "policy":"Source rows are conserved; compiled tariff tiles are a LEFT JOIN enrichment only.",
      "cacheManifest":"tariff_cache/manifest.json",
      "mapping":"irve_location_mapping.json"
    })
    reg=load_json(registry)
    for src in reg.get("sources",[]):
        if src.get("id")=="france-electroverse-r8":
            src.update({
              "adapter":"direct-offer-sharded-v1",
              "root":"../snapshot-inputs/FR/platforms/electroverse/",
              "manifest":"../snapshot-inputs/FR/platforms/electroverse/manifest.json",
              "label":"France pinned Electroverse exact EVSE tariffs (all supported pricing components)",
              "active":True,"optional":False,"refresh":"immutable-production-snapshot",
              "policy":"All compiled per-EVSE Electroverse tariffs are exposed, including heterogeneous connector prices, duration bands, time windows, parking and connection fees. Pricing complexity never excludes an offer; unresolved identity conflicts remain separately fail-closed."
            })
            src.pop("path",None)  # Old R9 flattened single-file path must not survive the R14 sharded source.
            break
    else:
        raise AssertionError("france-electroverse-r8 registry source missing")
    prod=reg.setdefault("productionIntegration",{})
    local=prod.setdefault("snapshotLocalSources",[])
    if "france-electroverse-r8" not in local: local.append("france-electroverse-r8")
    write_json(registry,reg)

    # Electra eMSP aggregate overlay is independent from Electroverse and
    # attaches only through exact national France EVSE/PDC identities.
    electra_platform=dl/"data/platforms/electra/france"
    electra_manifest=electra_platform/"manifest.json"
    if electra_manifest.exists():
        em=load_json(electra_manifest)
        assert em.get("policy",{}).get("nationalFranceIsIdentityHub") is True
        em_policy=em.get("policy",{})
        exact_only=em_policy.get("exactNationalEvseOnly") is True
        accepted=set(em_policy.get("acceptedIdentityModes") or [])
        curated_ok=("curated_irve_location" in accepted and em_policy.get("curatedMatchRequiresValidatedDistanceNameAddressPowerAndConnectorEvidence") is True)
        assert exact_only or curated_ok
        assert em.get("policy",{}).get("electroverseDependency") is False
        assert int((em.get("stats") or {}).get("publishedOffers") or 0) > 0
        copy_tree(electra_platform,overlays/"FR/platforms/electra")
        if (electra_platform/"source-locations.json.gz").exists():
            copy_file(electra_platform/"source-locations.json.gz",overlays/"FR/platforms/electra/source-locations.json.gz")
        write_json(overlays/"FR/platforms/electra/source-policy.json",{
          "dataset":"Electra France complete source overlay",
          "policy":"All compatible source locations and EVSEs are retained; compiled tiles are LEFT JOIN tariff enrichments.",
          "sourceArchive":"source-locations.json.gz"
        })
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

    # Electra exact direct tariffs: the national snapshot remains the
    # identity hub, while only station-level tariffs with fully supported
    # ENERGY components are published. Unsupported congestion components stay
    # fail-closed rather than being approximated.
    electra_exact=dl/"data/operator_direct/electra_exact_france.json"
    if electra_exact.exists():
        copy_file(electra_exact,fr_direct/"electra_exact_france.json")
        subprocess.run([
          sys.executable,
          str(production_root/"scripts/build_electra_direct_offers.py"),
          str(electra_exact),
          str(fr_direct/"electra_exact_direct_offers.json")
        ],check=True)
        reg=load_json(registry)
        for source in reg.get("sources",[]):
            if source.get("id")=="france-electra-direct-exact":
                source["active"]=True
                source["optional"]=False
                break
        else:
            raise AssertionError("Electra exact direct registry source missing")
        local=reg.setdefault("productionIntegration",{}).setdefault("snapshotLocalSources",[])
        if "france-electra-direct-exact" not in local:
            local.append("france-electra-direct-exact")
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
        "engineScopeCountries":["FR","NL","IT","ES","CH","DE","GB","MA","BE"]
      },
      "runtimeIntegration":{
        "registry":"runtime/data/v9/source-registry.json",
        "scripts":[
          "runtime/assets/v9/adapters/germany-national.js",
          "runtime/assets/v9/adapters/netherlands-dotnl.js",
          "runtime/assets/v9/adapters/belgium-nap.js",
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
        "TESLA":{"kind":"tesla","entry":"runtime/data/tesla_stations.json","coverage":"current","primarySource":tesla_cfg.get("primarySource","stable"),"sourceMetadata":"snapshot-inputs/TESLA/tariff-selection.json" if tesla_cfg.get("tariffPolicy")=="mac-country-10-days" else ("snapshot-inputs/TESLA/suc-tracker-metadata.json" if tesla_cfg.get("primarySource")=="dataLab" else None)},
        "ES":{"kind":"static-tiles","manifest":"runtime/data/v9/spain-static/manifest.json","offers":"runtime/data/v9/spain-reve-offers/manifest.json","coverage":"complete"},
        "NL":{"kind":"national-compact","manifest":"snapshot-inputs/NL/runtime/manifest.json","all":"snapshot-inputs/NL/runtime/all.json.gz","coverage":"complete-with-fail-closed-residuals"},
        "CH":{"kind":"canonical-overlay","manifest":"runtime/data/v9/switzerland-static/manifest.json","canonical":"snapshot-inputs/CH/switzerland_public_charging_v9.json","direct":"snapshot-inputs/CH/direct","coverage":"complete-with-fail-closed-residuals"},
        "MA":{"kind":"cpo-consolidated","manifest":"snapshot-inputs/MA/manifest.json","coverage":"partial"},
        "FR":{"kind":"canonical-overlay","manifest":"runtime/data/v9/france-static/manifest.json","canonical":"snapshot-inputs/FR/france_public_charging_canonical.json","direct":"snapshot-inputs/FR/direct","platforms":"snapshot-inputs/FR/platforms","identityHub":"national France station/EVSE baseline","coverage":"partial"},
        "IT":{"kind":"static-tiles","manifest":"runtime/data/v9/italy-static/manifest.json","offers":"runtime/data/v9/italy-offers.json","direct":"snapshot-inputs/IT/direct","coverage":"partial"},
        "DE":{"kind":"national-baseline","manifest":"snapshot-inputs/DE/manifest.json","all":"snapshot-inputs/DE/all.json.gz","direct":"snapshot-inputs/DE/direct","coverage":"partial"},
        "UK":{"kind":"validated-open-feeds","manifest":"snapshot-inputs/UK/manifest.json","all":"snapshot-inputs/UK/all.json.gz","coverage":"partial"},
        "BE":{"kind":"national-nap","manifest":"snapshot-inputs/BE/manifest.json","pages":"snapshot-inputs/BE/pages","coverage":"partial-selected-cpo"}
      }
    }
    if not any(d.get("id")=="BE" for d in cfg.get("datasets",[])):
        contract["deployment"]["engineScopeCountries"].remove("BE")
        contract["datasets"].pop("BE")
    if nl_cfg.get("primarySource")!="dataLab":
        contract["datasets"]["NL"]={"kind":"static-tiles","manifest":"runtime/data/non_tesla_netherlands/manifest.json","coverage":"complete"}
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
