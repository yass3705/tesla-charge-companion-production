#!/usr/bin/env python3
import argparse
import hashlib
import json
import pathlib
import shutil

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
    overlays=out/"snapshot-inputs"

    # CH and FR authoritative canonical snapshots newer than legacy runtime.
    pairs=[
      (dl/"data/national/switzerland_public_charging_v9.json", overlays/"CH/switzerland_public_charging_v9.json"),
      (dl/"data/national/france_public_charging_canonical.json", overlays/"FR/france_public_charging_canonical.json"),
    ]
    for src,dst in pairs:
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
      ("Kilowatt native","reports/morocco/kilowatt/latest-native-connector-tariffs.json","kilowatt-native-tariffs.json"),
      ("Kilowatt overlay","reports/morocco/kilowatt/latest-v9-tariff-overlay-manifest.json","kilowatt-tariff-overlay.json"),
      ("EVOne policy","reports/morocco/evone/production-status-policy.json","evone-status-policy.json"),
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
        "Kilowatt":{"productionStations":43,"tariffResolvedStations":43}
      },
      "deduplication":"Do not sum source station counts. Canonical identity reconciliation is required across CPO/access-network overlaps.",
      "policy":"Publish validated CPO stations and exact tariffs only; unresolved operators and tariff components remain fail-closed."
    })

    # Italy validated direct overlays beside the compiled static baseline.
    it_dst=overlays/"IT/direct"
    it_dst.mkdir(parents=True,exist_ok=True)
    for p in national.glob("*italy*"):
        if p.is_file(): copy_file(p,it_dst/p.name)

    # Germany national BNetzA/AFIR baseline + current resolution ledger.
    if a.germany_source:
        de_src=pathlib.Path(a.germany_source)
        catalog=de_src/"germany_non_tesla_catalog_staging_direct_cpo.json.gz"
        source_manifest=de_src/"germany_non_tesla_catalog_staging_direct_cpo_manifest.json"
        assert catalog.exists() and source_manifest.exists(), "Germany source artifact incomplete"
        de=overlays/"DE"
        copy_file(catalog,de/"all.json.gz")
        copy_file(source_manifest,de/"national-source-manifest.json")
        prod_ledger=pathlib.Path("docs/source-ledgers/germany-cpo-second-pass-resolution-180.json")
        copy_file(prod_ledger,de/"resolution-ledger.json")
        m=load_json(source_manifest)
        ledger=load_json(prod_ledger)
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
      "datasets":{
        "TESLA":{"kind":"tesla","entry":"runtime/data/tesla_stations.json","coverage":"current"},
        "ES":{"kind":"static-tiles","manifest":"runtime/data/v9/spain-static/manifest.json","offers":"runtime/data/v9/spain-reve-offers/manifest.json","coverage":"complete"},
        "NL":{"kind":"static-tiles","manifest":"runtime/data/non_tesla_netherlands/manifest.json","coverage":"complete"},
        "CH":{"kind":"canonical-overlay","manifest":"runtime/data/v9/switzerland-static/manifest.json","canonical":"snapshot-inputs/CH/switzerland_public_charging_v9.json","coverage":"complete-with-fail-closed-residuals"},
        "MA":{"kind":"cpo-consolidated","manifest":"snapshot-inputs/MA/manifest.json","coverage":"partial"},
        "FR":{"kind":"canonical-overlay","manifest":"runtime/data/v9/france-static/manifest.json","canonical":"snapshot-inputs/FR/france_public_charging_canonical.json","coverage":"partial"},
        "IT":{"kind":"static-tiles","manifest":"runtime/data/v9/italy-static/manifest.json","offers":"runtime/data/v9/italy-offers.json","direct":"snapshot-inputs/IT/direct","coverage":"partial"},
        "DE":{"kind":"national-baseline","manifest":"snapshot-inputs/DE/manifest.json","all":"snapshot-inputs/DE/all.json.gz","coverage":"partial"},
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
