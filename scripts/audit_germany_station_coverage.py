#!/usr/bin/env python3
"""Audit whether pinned IONITY Germany adds national stations or duplicate identities.

Read-only diagnostic: never append sites or promote tariffs by proximity.
"""
import collections
import gzip
import json
import math
import pathlib
import sys

def load(path):
    with gzip.open(path,"rt",encoding="utf-8") as fh:
        return json.load(fh)

def norm(v):
    return "".join(c for c in str(v or "").upper() if c.isalnum())

def coord(o, site=False):
    if site: o=o.get("coordinates") or {}
    try:
        a=float(o.get("latitude"));b=float(o.get("longitude"))
    except (TypeError,ValueError):return None
    if not math.isfinite(a) or not math.isfinite(b):return None
    return (round(a,6),round(b,6))

def audit(baseline,overlay):
    sites=baseline.get("sites") or []
    locs=overlay.get("locations") or []
    site_by_id={}
    evse_index=collections.defaultdict(set)
    coord_index=collections.defaultdict(set)
    for i,site in enumerate(sites):
        sid=str(site.get("id") or "")
        site_by_id[i]=site
        for value in site.get("evseIds") or []:
            key=norm(value)
            if key:evse_index[key].add(i)
        pos=coord(site,True)
        if pos:coord_index[pos].add(i)
    buckets=collections.Counter()
    samples=collections.defaultdict(list)
    unique_evse_matches=set()
    exact_coord_matches=set()
    definite_overlay_only=[]
    national_ionity_count=sum(1 for s in sites if "ionity" in str(s.get("operator") or "").lower())
    for loc in locs:
        connector_ids=[norm(x.get("evseId") or x.get("sourceEvseId") or x.get("id")) for x in loc.get("connectors") or []]
        connector_ids=[x for x in connector_ids if x]
        evse_sites=set().union(*(evse_index.get(k,set()) for k in connector_ids)) if connector_ids else set()
        pos=coord(loc)
        coord_sites=coord_index.get(pos,set()) if pos else set()
        label={"locationId":loc.get("locationId"),"name":loc.get("name"),
          "connectorCount":len(loc.get("connectors") or []),"candidateEvseSites":len(evse_sites),
          "exactCoordSites":len(coord_sites)}
        if len(evse_sites)==1:
            sid=next(iter(evse_sites))
            key="unique_exact_evse";unique_evse_matches.add(sid)
            if coord_sites and sid not in coord_sites:key="evse_matched_but_coordinate_differs"
            label.update({"matchedNationalId":site_by_id[sid].get("id"),"matchedOperator":site_by_id[sid].get("operator")})
        elif len(evse_sites)>1:
            key="evse_conflicting_national_sites"
        elif len(coord_sites)==1:
            sid=next(iter(coord_sites))
            key="unique_exact_coordinate_only";exact_coord_matches.add(sid)
            label.update({"matchedNationalId":site_by_id[sid].get("id"),"matchedOperator":site_by_id[sid].get("operator")})
        elif len(coord_sites)>1:
            key="ambiguous_exact_coordinate"
        elif not connector_ids:
            key="no_evse_ids_and_no_exact_coordinate"
        else:
            key="no_exact_identity_match"
        buckets[key]+=1
        if len(samples[key])<12:samples[key].append(label)
        if key in ("no_exact_identity_match","no_evse_ids_and_no_exact_coordinate"):
            definite_overlay_only.append({"name":loc.get("name"),"locationId":loc.get("locationId"),
               "latitude":loc.get("latitude"),"longitude":loc.get("longitude"),
               "connectorEvseIds":[x.get("evseId") or x.get("sourceEvseId") or x.get("id") for x in loc.get("connectors") or []]})
    return {"schemaVersion":1,"baseline":{
        "nationalNonTeslaStations":len(sites),"nationalIonityOperatorSites":national_ionity_count,
        "indexedNationalEvseIds":len(evse_index),"indexedCoordinates":len(coord_index)},
       "ionity":{"sourceLocations":len(locs),"sourceConnectors":sum(len(l.get("connectors") or []) for l in locs)},
       "classification":dict(buckets),"sampleByClass":dict(samples),
       "potentialAdditionalLocationsNotYetPromotable":definite_overlay_only,
       "policy":"No site automatically appended; unmatched IONITY sites require deterministic national absence and distinct identity audit, not geographic proximity. First-pass CPO classification is not station inventory."}

def main():
    root=pathlib.Path(sys.argv[1])
    result=audit(load(root/"data/national/germany_non_tesla_catalog_staging_direct_cpo.json.gz"),load(root/"data/national/ionity_direct_stations_germany.json.gz"))
    output=pathlib.Path(sys.argv[2]);output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"baseline":result["baseline"],"ionity":result["ionity"],"classification":result["classification"],"potentialAdditional":len(result["potentialAdditionalLocationsNotYetPromotable"])},ensure_ascii=False))
if __name__=="__main__":
    main()
