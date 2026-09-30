#!/usr/bin/env python3
"""Build conservative, unpriced IONITY Germany inventory supplement from pinned r8.

Adds only directly observed IONITY_CPO locations with:
 - valid distinct provider location UUID and country DE
 - no identified IONITY national site within 2 km
 - no national charging site of any operator within 250 m
This is a conservative inventory supplement, NOT a tariff reconciliation.
"""
import gzip, json, math, pathlib, sys
def read(path):
    with gzip.open(path,"rt",encoding="utf-8") as f:return json.load(f)
def pos(o,nested=False):
    if nested:o=o.get("coordinates") or {}
    try:lat=float(o.get("latitude"));lon=float(o.get("longitude"))
    except (TypeError,ValueError):return None
    return (lat,lon) if math.isfinite(lat) and math.isfinite(lon) else None
def dist(a,b):
    a,b,c,d=map(math.radians,(*a,*b))
    h=math.sin((c-a)/2)**2+math.cos(a)*math.cos(c)*math.sin((d-b)/2)**2
    return 12742000*math.asin(min(1,math.sqrt(h)))
def build(national, direct):
    national_sites=national.get("sites") or []
    positions=[(pos(s,True),s) for s in national_sites]
    positions=[(p,s) for p,s in positions if p]
    ionity=[(p,s) for p,s in positions if "ionity" in str(s.get("operator") or "").lower()]
    ids=set();add=[];quarantine=[];already=0
    for loc in direct.get("locations") or []:
        if loc.get("country")!="DE" or loc.get("cpoIdentifier")!="IONITY_CPO":
            raise ValueError("Unexpected IONITY Germany source scope")
        uuid=str(loc.get("uuid") or "").strip()
        p=pos(loc)
        if not uuid or uuid in ids or not p:
            raise ValueError("Missing/duplicate provider UUID or invalid coordinate")
        ids.add(uuid)
        near_ionity=min((dist(p,ip) for ip,_ in ionity),default=float("inf"))
        if near_ionity<=2000:
            already+=1
            continue
        near_any=min((dist(p,np) for np,_ in positions),default=float("inf"))
        entry={"providerUuid":uuid,"name":loc.get("name"),"latitude":p[0],"longitude":p[1],
            "closestNationalSiteMeters":None if not math.isfinite(near_any) else round(near_any,1),
            "closestNationalIonityMeters":None if not math.isfinite(near_ionity) else round(near_ionity,1)}
        if near_any<=250:
            quarantine.append({**entry,"reason":"third_party_national_site_within_250m_requires_manual_identity_review"})
            continue
        add.append({
            "id":"ionity-direct:"+uuid,
            "operator":"IONITY",
            "name":str(loc.get("name") or "IONITY Direct"),
            "coordinates":{"latitude":p[0],"longitude":p[1]},
            "sourceStationIds":["ionity:"+uuid],
            "evseIds":[],
            "maxConnectionPowerKw":max((float(c.get("powerKw")) for c in loc.get("connectors") or [] if c.get("powerKw") is not None),default=None),
            "declaredChargePoints":len(loc.get("connectors") or []),
            "service":{"state":"unknown"},
            "pricing":{},
            "source":{"dataset":"pinned-r8-ionity-direct-germany","identityMode":"unique_first_party_uuid_and_isolated_location",
                      "country":"DE","cpoIdentifier":"IONITY_CPO","unpricedFailClosed":True}
        })
    add.sort(key=lambda x:x["id"])
    assert len(add)+len(quarantine)+already==len(ids)
    return {"schemaVersion":1,"country":"DE","sites":add,
       "metadata":{"nationalBaselineStations":len(national_sites),"ionitySourceLocations":len(ids),
                   "alreadyNearNationalIonity":already,"isolatedUnpricedSupplement":len(add),
                   "quarantinedNearThirdParty":len(quarantine),"quarantine":quarantine,
                   "policy":"Only conservative first-party inventory additions with no site within 250m and no IONITY within 2km. No EVSE identities or tariffs inferred."}}
if __name__=="__main__":
    root=pathlib.Path(sys.argv[1]);out=pathlib.Path(sys.argv[2])
    result=build(read(root/"data/national/germany_non_tesla_catalog_staging_direct_cpo.json.gz"),read(root/"data/national/ionity_direct_stations_germany.json.gz"))
    # Pinned r8 evidence gate: unexpected drift must not silently change inclusion.
    assert result["metadata"]["ionitySourceLocations"]==199,result["metadata"]
    assert result["metadata"]["isolatedUnpricedSupplement"]==3,result["metadata"]
    out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({k:v for k,v in result["metadata"].items() if k!="quarantine"},ensure_ascii=False))
