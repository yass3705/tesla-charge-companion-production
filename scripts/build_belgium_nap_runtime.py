#!/usr/bin/env python3
"""Build a tiled BE baseline and conservative exact-EVSE ad-hoc prices."""
import argparse
import gzip
import hashlib
import json
import math
from collections import defaultdict
from pathlib import Path


def write_gzip(path, value):
    raw=json.dumps(value,ensure_ascii=False,separators=(",",":")).encode()
    path.parent.mkdir(parents=True,exist_ok=True)
    with path.open("wb") as f:
        with gzip.GzipFile(fileobj=f,mode="wb",mtime=0) as out:out.write(raw)
    return hashlib.sha256(path.read_bytes()).hexdigest()


def manifest_entry(path,points,count):
    return {"file":path.name,"count":count,"minLat":min(p[0] for p in points),"maxLat":max(p[0] for p in points),"minLon":min(p[1] for p in points),"maxLon":max(p[1] for p in points),"sha256":hashlib.sha256(path.read_bytes()).hexdigest()}


def exact_kwh(evse):
    prices=evse.get("prices") or []
    if len(prices)!=1:return None
    price=prices[0]
    if price.get("ratePolicy")!="adHoc" or price.get("priceType")!="pricePerKWh" or price.get("currency")!="EUR":return None
    value=price.get("value")
    if not isinstance(value,(int,float)) or not math.isfinite(value) or value<=0:return None
    if price.get("taxIncluded") is True:return round(value,6)
    tax=price.get("taxRate")
    if price.get("taxIncluded") is False and isinstance(tax,(int,float)) and 0<=tax<=30:return round(value*(1+tax/100),6)
    return None


def build(source_root,out_root):
    source=json.loads((source_root/"data/belgium/nap-belgium-manifest.json").read_text())
    inventory=defaultdict(list);offers=defaultdict(list);locations=0;priced=0;skipped=0
    for page in source["pages"]:
        with gzip.open(source_root/page["canonicalPath"],"rt") as f:payload=json.load(f)
        for loc in payload["locations"]:
            lat=loc.get("latitude");lon=loc.get("longitude")
            if not isinstance(lat,(int,float)) or not isinstance(lon,(int,float)) or not (49<=lat<=52 and 2<=lon<=7):continue
            key=(math.floor(lat),math.floor(lon));operator=loc.get("operator") or "Opérateur inconnu"
            station_id=loc.get("id");configs=[];states=[];updated=[]
            for site in loc.get("stations") or []:
                for evse in site.get("evses") or []:
                    evse_id=evse.get("id")
                    if not evse_id:continue
                    status=str(evse.get("status") or "").lower()
                    if status not in ("available","charging","occupied"):
                        continue
                    connectors=evse.get("connectors") or []
                    watts=max([c.get("maxPowerW") or 0 for c in connectors]+[0]) or max(evse.get("availableChargingPowerW") or [0])
                    power=round(watts/1000,3)
                    if power<=0:continue
                    kind="DC" if str(evse.get("currentType") or "").lower()=="dc" else "AC"
                    configs.append([evse_id,f"{operator} · {evse_id}",kind,power,1,[],[]])
                    states.append(status)
                    status_date=(evse.get("statusRaw") or {}).get("lastUpdated")
                    if status_date:updated.append(status_date)
                    price=exact_kwh(evse)
                    if price is None:skipped+=1;continue
                    offers[key].append({"id":f"nap-be:{station_id}:{evse_id}","provider":operator,"stationIds":[station_id],"evseIds":[evse_id],"verifiedScope":"exact_evse","currency":"EUR","directOperatorOnly":True,"pricing":{"type":"kwh","pricePerKwh":price},"source":"Belgian NAP ad-hoc EVSE price, VAT included"})
                    priced+=1
            if not configs:continue
            state="AVAILABLE" if any(s in ("available","charging","occupied") for s in states) else "OUT_OF_SERVICE" if states and all(s in ("outoforder","out_of_order","inoperative","blocked") for s in states) else "UNKNOWN"
            address=", ".join([*(loc.get("addressLines") or []),str(loc.get("postcode") or ""),str(loc.get("city") or "")]).strip(", ")
            access=[[day,"00:00","24:00"] for day in range(7)]
            inventory[key].append([station_id,loc.get("brand") or operator,address,lat,lon,operator,len(configs),access,configs,max(updated) if updated else None,state,operator])
            locations+=1
    static_dir=out_root/"belgium-static";offer_dir=out_root/"belgium-nap-offers"
    static_dir.mkdir(parents=True,exist_ok=True);offer_dir.mkdir(parents=True,exist_ok=True)
    all_rows=[row for key in sorted(inventory) for row in inventory[key]]
    all_sha=write_gzip(static_dir/"all.json.gz",all_rows)
    static_tiles=[];offer_tiles=[]
    for key,rows in sorted(inventory.items()):
        stem=f"{key[0]}_{key[1]}";path=static_dir/f"tile_{stem}.json.gz";write_gzip(path,rows)
        static_tiles.append(manifest_entry(path,[(r[3],r[4]) for r in rows],len(rows)))
        selected=offers.get(key) or []
        if selected:
            path=offer_dir/f"offers_{stem}.json.gz";write_gzip(path,{"country":"BE","directOffers":selected})
            offer_tiles.append(manifest_entry(path,[(r[3],r[4]) for r in rows],len(selected)))
    common={"schemaVersion":4,"country":"BE","source":source.get("source"),"generatedAt":source.get("generatedAt")}
    (static_dir/"manifest.json").write_text(json.dumps({**common,"allFile":"all.json.gz","allSha256":all_sha,"stationCount":locations,"tiles":static_tiles},indent=2)+"\n")
    (offer_dir/"manifest.json").write_text(json.dumps({**common,"schemaVersion":1,"offerCount":priced,"skippedAmbiguousOrUnsupportedEvsePrices":skipped,"tiles":offer_tiles},indent=2)+"\n")
    print(json.dumps({"stationCount":locations,"exactPricedEvseCount":priced,"unpricedEvseCount":skipped,"tiles":len(static_tiles)}))


if __name__=="__main__":
    parser=argparse.ArgumentParser();parser.add_argument("source_root",type=Path);parser.add_argument("out_root",type=Path)
    args=parser.parse_args();build(args.source_root,args.out_root)
