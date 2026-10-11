#!/usr/bin/env python3
"""Build conservative, unpriced IONITY Germany inventory supplement from pinned r8.

Adds only directly observed IONITY_CPO locations with:
 - valid distinct provider location UUID and country DE
 - no identified IONITY national site within 2 km
 - no national charging site of any operator within 250 m
This is a conservative inventory supplement, NOT a tariff reconciliation.
"""
import argparse, gzip, hashlib, json, math, pathlib, subprocess, uuid

NATIONAL_FILE="germany_non_tesla_catalog_staging_direct_cpo.json.gz"
IONITY_FILE="ionity_direct_stations_germany.json.gz"
PROVENANCE_FILE=pathlib.Path(__file__).resolve().parents[1]/"config/germany-ionity-supplement-provenance.json"

def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def provenance_for(national_path, direct_path, manifest_path=PROVENANCE_FILE):
    manifest=json.loads(pathlib.Path(manifest_path).read_text(encoding="utf-8"))
    if manifest.get("schemaVersion")!=1:
        raise ValueError("Unsupported Germany IONITY provenance manifest")
    national_hash=sha256(national_path)
    direct_hash=sha256(direct_path)
    matches=[entry for entry in manifest["sources"] if entry["nationalSha256"]==national_hash and entry["ionitySha256"]==direct_hash]
    if len(matches)!=1:
        raise ValueError(f"Unknown Germany IONITY source provenance: national={national_hash} ionity={direct_hash}")
    return matches[0]

def validate_result(result, provenance):
    metadata=result["metadata"]
    for field, expected in provenance["expected"].items():
        if metadata.get(field)!=expected:
            raise ValueError(f"Germany IONITY {provenance['id']} {field}: expected {expected}, got {metadata.get(field)}")
    if len(metadata["quarantine"])!=metadata["quarantinedNearThirdParty"] or any(
        item.get("reason")!="third_party_national_site_within_250m_requires_manual_identity_review"
        for item in metadata["quarantine"]
    ):
        raise ValueError("Germany IONITY quarantine drift")
    quarantine_ids=[item.get("providerUuid") for item in metadata["quarantine"]]
    if len(set(quarantine_ids))!=len(quarantine_ids) or any(
        pos(item) is None or not isinstance(item.get("closestNationalSiteMeters"),(int,float))
        or item["closestNationalSiteMeters"]>250 for item in metadata["quarantine"]
    ):
        raise ValueError("Germany IONITY quarantine identity or proximity drift")
    sites=result["sites"]
    if len(sites)!=metadata["isolatedUnpricedSupplement"] or len({site["id"] for site in sites})!=len(sites):
        raise ValueError("Germany IONITY isolated inventory identity drift")
    if any(pos(site,True) is None or site.get("sourceStationIds")!=[site["id"].replace("ionity-direct:","ionity:")]
           or site["id"].removeprefix("ionity-direct:") in quarantine_ids for site in sites):
        raise ValueError("Germany IONITY isolated coordinates or provider identity drift")
    if any(site.get("pricing")!={} or site.get("evseIds")!=[] or site.get("source",{}).get("unpricedFailClosed") is not True for site in sites):
        raise ValueError("Germany IONITY isolated inventory must remain unpriced without EVSE identities")

def read(path):
    with gzip.open(path,"rt",encoding="utf-8") as f:return json.load(f)
def pos(o,nested=False):
    if nested:o=o.get("coordinates") or {}
    try:lat=float(o.get("latitude"));lon=float(o.get("longitude"))
    except (TypeError,ValueError):return None
    return (lat,lon) if math.isfinite(lat) and math.isfinite(lon) and -90<=lat<=90 and -180<=lon<=180 else None
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
        provider_uuid=str(loc.get("uuid") or "").strip()
        p=pos(loc)
        try:
            valid_uuid=str(uuid.UUID(provider_uuid))==provider_uuid.lower()
        except (ValueError, AttributeError):
            valid_uuid=False
        if not valid_uuid or provider_uuid in ids or not p:
            raise ValueError("Missing/duplicate provider UUID or invalid coordinate")
        ids.add(provider_uuid)
        near_ionity=min((dist(p,ip) for ip,_ in ionity),default=float("inf"))
        if near_ionity<=2000:
            already+=1
            continue
        near_any=min((dist(p,np) for np,_ in positions),default=float("inf"))
        entry={"providerUuid":provider_uuid,"name":loc.get("name"),"latitude":p[0],"longitude":p[1],
            "closestNationalSiteMeters":None if not math.isfinite(near_any) else round(near_any,1),
            "closestNationalIonityMeters":None if not math.isfinite(near_ionity) else round(near_ionity,1)}
        if near_any<=250:
            quarantine.append({**entry,"reason":"third_party_national_site_within_250m_requires_manual_identity_review"})
            continue
        add.append({
            "id":"ionity-direct:"+provider_uuid,
            "operator":"IONITY",
            "name":str(loc.get("name") or "IONITY Direct"),
            "coordinates":{"latitude":p[0],"longitude":p[1]},
            "sourceStationIds":["ionity:"+provider_uuid],
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
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("datalab",type=pathlib.Path)
    parser.add_argument("out",type=pathlib.Path)
    parser.add_argument("--expected-datalab-sha")
    args=parser.parse_args()
    root=args.datalab;out=args.out
    actual=subprocess.check_output(["git","-C",str(root),"rev-parse","HEAD"],text=True).strip()
    if args.expected_datalab_sha:
        if actual!=args.expected_datalab_sha:
            raise ValueError(f"Data Lab checkout SHA mismatch: expected {args.expected_datalab_sha}, got {actual}")
    national_path=root/"data/national"/NATIONAL_FILE
    direct_path=root/"data/national"/IONITY_FILE
    provenance=provenance_for(national_path,direct_path)
    result=build(read(national_path),read(direct_path))
    validate_result(result,provenance)
    result["metadata"]["provenance"]={"id":provenance["id"],"referenceDataLabSha":provenance["referenceDataLabSha"],
        "checkoutDataLabSha":actual,
        "nationalSha256":provenance["nationalSha256"],"ionitySha256":provenance["ionitySha256"]}
    out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({k:v for k,v in result["metadata"].items() if k!="quarantine"},ensure_ascii=False))
