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
import unicodedata

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
    national_ionity=[s for s in sites if "ionity" in str(s.get("operator") or "").lower()]
    national_ionity_count=len(national_ionity)
    def meters(a,b):
        lat1,lon1=map(math.radians,a);lat2,lon2=map(math.radians,b)
        z=math.sin((lat2-lat1)/2)**2+math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2
        return 12742000*math.asin(min(1,math.sqrt(z)))
    def normalized_name(v):
        v=unicodedata.normalize("NFKD",str(v or "").lower())
        return "".join(c for c in v if c.isalnum() and not unicodedata.combining(c))
    geographic=collections.Counter()
    geographic_by_identity=collections.defaultdict(collections.Counter)
    geographic_samples=collections.defaultdict(list)
    no_near_ionity=[]
    ionity_geo=[(coord(s,True),s) for s in national_ionity]
    ionity_geo=[x for x in ionity_geo if x[0]]

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
        if key in ("no_exact_identity_match","no_evse_ids_and_no_exact_coordinate","ambiguous_exact_coordinate"):
            candidates=[]
            for nc,site in ionity_geo:
                if pos is None:continue
                distance=meters(pos,nc)
                if distance<=2000:
                    candidates.append((distance,site))
            candidates.sort(key=lambda x:x[0])
            within50=sum(d<=50 for d,_ in candidates)
            within250=sum(d<=250 for d,_ in candidates)
            if within50:geo_class="ionity_within_50m"
            elif within250:geo_class="ionity_within_250m"
            elif candidates:geo_class="ionity_within_2km"
            else:geo_class="no_ionity_within_2km"
            geographic[geo_class]+=1
            geographic_by_identity[key][geo_class]+=1
            row={"name":loc.get("name"),"locationId":loc.get("locationId"),
                "latitude":loc.get("latitude"),"longitude":loc.get("longitude"),
                "exactCoordinateNationalSites":len(coord_sites),
                "nearbyIonityWithin50m":within50,"nearbyIonityWithin250m":within250,
                "nearbyCandidates":[{"meters":round(d,1),"nationalId":site.get("id"),"nationalName":site.get("name"),
                   "nationalOperator":site.get("operator"),
                   "sameNormalizedName":normalized_name(site.get("name"))==normalized_name(loc.get("name"))} for d,site in candidates[:5]]}
            if geo_class=="no_ionity_within_2km" and pos:
                all_candidates=[]
                for site in sites:
                    sc=coord(site,True)
                    if not sc:continue
                    distance=meters(pos,sc)
                    if distance<=2000:all_candidates.append((distance,site))
                all_candidates.sort(key=lambda x:x[0])
                row["allNationalSitesWithin250m"]=sum(d<=250 for d,_ in all_candidates)
                row["nearestAnyNationalSites"]=[{"meters":round(d,1),"id":site.get("id"),
                   "operator":site.get("operator"),"name":site.get("name")} for d,site in all_candidates[:4]]
                no_near_ionity.append(row)
            if len(geographic_samples[geo_class])<8:geographic_samples[geo_class].append(row)
            definite_overlay_only.append(row)
    return {"schemaVersion":1,"baseline":{
        "nationalNonTeslaStations":len(sites),"nationalIonityOperatorSites":national_ionity_count,
        "indexedNationalEvseIds":len(evse_index),"indexedCoordinates":len(coord_index)},
       "ionity":{"sourceLocations":len(locs),"sourceConnectors":sum(len(l.get("connectors") or []) for l in locs)},
       "classification":dict(buckets),"nearbyDiagnostic":dict(geographic),"nearbyByIdentity":{k:dict(v) for k,v in geographic_by_identity.items()},"noNearbyIonityCandidates":no_near_ionity,"nearbySamples":dict(geographic_samples),"sampleByClass":dict(samples),
       "potentialAdditionalLocationsNotYetPromotable":definite_overlay_only,
       "policy":"No site automatically appended; unmatched IONITY sites require deterministic national absence and distinct identity audit, not geographic proximity. First-pass CPO classification is not station inventory."}

def main():
    root=pathlib.Path(sys.argv[1])
    result=audit(load(root/"data/national/germany_non_tesla_catalog_staging_direct_cpo.json.gz"),load(root/"data/national/ionity_direct_stations_germany.json.gz"))
    output=pathlib.Path(sys.argv[2]);output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"baseline":result["baseline"],"ionity":result["ionity"],"classification":result["classification"],"potentialAdditional":len(result["potentialAdditionalLocationsNotYetPromotable"]),"nearbyDiagnostic":result["nearbyDiagnostic"],"nearbyByIdentity":result["nearbyByIdentity"],"noNearbyCandidates":[{"name":r["name"],"nearestAnyNationalSites":r.get("nearestAnyNationalSites",[]),"allNationalSitesWithin250m":r.get("allNationalSitesWithin250m",0)} for r in result["noNearbyIonityCandidates"]]},ensure_ascii=False))
if __name__=="__main__":
    main()
