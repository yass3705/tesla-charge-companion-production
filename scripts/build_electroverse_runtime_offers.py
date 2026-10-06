#!/usr/bin/env python3
import argparse, collections, gzip, json, math, pathlib, re, unicodedata

PRICE_RE=re.compile(r"€\s*([0-9]+(?:[.,][0-9]+)?)",re.I)

def normalized(value):
    value=unicodedata.normalize('NFKD',str(value or ''))
    return re.sub(r'[^a-z0-9]','',value.encode('ascii','ignore').decode().lower())

def national_identity_bridge(national_path,mapping_path):
    with gzip.open(national_path,'rt',encoding='utf-8') as file:
        national_rows=json.load(file)
    national_ids={str(row[0]) for row in national_rows if isinstance(row,list) and row}
    grid=collections.defaultdict(list)
    for row in national_rows:
        try:
            lat,lon=float(row[3]),float(row[4])
            if not math.isfinite(lat) or not math.isfinite(lon):continue
        except (IndexError,TypeError,ValueError):continue
        grid[(round(lat*200),round(lon*200))].append(row)
    mappings=json.loads(pathlib.Path(mapping_path).read_text())['mappings']
    proposals={};duplicate_new=set()
    for entry in mappings:
        new_id=str(entry.get('irveStationId') or '')
        if not new_id.startswith('FR') or new_id in national_ids or entry.get('confidence')!='high':continue
        if new_id in proposals:duplicate_new.add(new_id);continue
        irve=entry.get('irve') or {}
        lat,lon=irve.get('lat'),irve.get('lon')
        if not isinstance(lat,(int,float)) or not isinstance(lon,(int,float)):continue
        if not math.isfinite(lat) or not math.isfinite(lon):continue
        candidates=[]
        for latitude_bin in range(round(lat*200)-1,round(lat*200)+2):
            for longitude_bin in range(round(lon*200)-1,round(lon*200)+2):
                for row in grid[(latitude_bin,longitude_bin)]:
                    old_id=str(row[0])
                    if not old_id.startswith('FR'):continue
                    distance=111195*math.hypot(lat-float(row[3]),(lon-float(row[4]))*math.cos(math.radians(lat)))
                    if distance>10:continue
                    if normalized(row[1])!=normalized(irve.get('name')):continue
                    if normalized(row[5])!=normalized(irve.get('operator')):continue
                    old_pdcs={str(pdc) for config in row[8] for pdc in (config[6] if len(config)>6 and isinstance(config[6],list) else [])}
                    new_pdcs={str(pdc) for pdc in entry.get('irvePdcIds') or []}
                    if not old_pdcs.intersection(new_pdcs) and distance>1:continue
                    candidates.append((old_id,distance,bool(old_pdcs.intersection(new_pdcs))))
        if len(candidates)==1:proposals[new_id]=candidates[0]
    target_counts=collections.Counter(value[0] for value in proposals.values())
    safe={new_id:target for new_id,target in proposals.items() if new_id not in duplicate_new and target_counts[target[0]]==1}
    return national_ids,safe

def parse_money(text):
    if not isinstance(text,str): return None
    m=PRICE_RE.search(text)
    return float(m.group(1).replace(",",".")) if m else None

def connector_tuple(conn):
    if conn.get("complexPricingDetail") not in (None,{},[],""):
        return None,"complex_pricing"
    comps=conn.get("priceComponents") or []
    values={"ENERGY":0.0,"TIME":0.0,"PARKING":0.0,"FLAT":0.0}
    seen=set()
    for c in comps:
        typ=str(c.get("__typename") or "")
        val=parse_money(c.get("formattedValue"))
        if typ=="ConsumptionRate":
            if val is None:return None,"bad_consumption"
            values["ENERGY"]=val;seen.add("ENERGY")
        elif typ=="TimeRate":
            if val is None:return None,"bad_time"
            values["TIME"]=val;seen.add("TIME")
        elif typ=="ParkingTimeRate":
            if val is None:return None,"bad_parking"
            values["PARKING"]=val;seen.add("PARKING")
        elif typ=="ConnectionFee":
            if val is None:return None,"bad_connection"
            values["FLAT"]=val;seen.add("FLAT")
        elif typ in ("VAT",):
            continue
        else:
            return None,"unsupported_component"
    if "ENERGY" not in seen and not conn.get("isChargingFree"):
        return None,"missing_energy"
    if conn.get("isChargingFree") is True:
        values["ENERGY"]=0.0
    return (
      round(values["ENERGY"],6),
      round(values["TIME"],6),
      round(values["PARKING"],6),
      round(values["FLAT"],6)
    ),None

def station_offer(row):
    station_id=str(row.get("irveStationId") or "").strip()
    if not station_id.startswith("FR"): return None,"not_fr"
    if str(row.get("matchConfidence") or "").lower()!="high": return None,"not_high_confidence"
    tariff=row.get("tariff") or {}
    connectors=[]
    for evse in tariff.get("evses") or []:
        connectors.extend(evse.get("connectors") or [])
    if not connectors:return None,"no_connectors"
    tuples=[]
    for c in connectors:
        t,reason=connector_tuple(c)
        if t is None:return None,reason
        tuples.append(t)
    uniq=sorted(set(tuples))
    if len(uniq)!=1:return None,"heterogeneous_connector_tariffs"
    energy,time_rate,parking,flat=uniq[0]
    return {
      "id":f"electroverse:{row.get('electroverseLocationPk')}",
      "provider":"Electroverse",
      "stationIds":[station_id],
      "countries":["FR"],
      "currency":"EUR",
      "priority":80,
      "pricing":{
        "type":"rules",
        "rules":[{
          "scope":"allDay","start":"00:00","end":"24:00","billing":"kwh","currency":"EUR",
          "pricePerKwh":energy,"chargePerMinute":time_rate,"connectionFee":flat,
          "idlePerMinute":parking,"afterMinutesRate":0,"afterMinutesThreshold":0,
          "days":None,"ocpiDurationBands":[]
        }]
      },
      "metadata":{
        "verified":True,
        "matchPolicy":"high_confidence_irve_station_mapping_plus_uniform_connector_tariff",
        "electroverseLocationPk":str(row.get("electroverseLocationPk") or ""),
        "tariffHash":row.get("tariffHash"),
        "fetchedAt":row.get("fetchedAt"),
        "connectorCount":len(connectors)
      }
    },None

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--cache-dir",required=True)
    ap.add_argument("--manifest",required=True)
    ap.add_argument("--national",required=True,help="Pinned FR static all.json.gz inventory")
    ap.add_argument("--mapping",required=True,help="Pinned high-confidence Electroverse/IRVE identity mapping")
    ap.add_argument("--out",required=True)
    args=ap.parse_args()
    cache=pathlib.Path(args.cache_dir)
    manifest=json.loads(pathlib.Path(args.manifest).read_text())
    national_ids,bridges=national_identity_bridge(args.national,args.mapping)
    offers=[];rejected={};seen_station=set();input_rows=0
    for sh in manifest.get("shards") or []:
        p=cache/sh["file"]
        data=json.loads(p.read_text())
        for row in (data.get("stations") or {}).values():
            input_rows+=1
            offer,reason=station_offer(row)
            if offer is None:
                rejected[reason]=rejected.get(reason,0)+1
                continue
            sid=offer["stationIds"][0]
            if sid in seen_station:
                rejected["duplicate_irve_station_id"]=rejected.get("duplicate_irve_station_id",0)+1
                continue
            seen_station.add(sid);offers.append(offer)
    join_counts=collections.Counter()
    source_ids={offer['stationIds'][0] for offer in offers}
    for offer in offers:
        source_id=offer['stationIds'][0]
        if source_id in national_ids:
            join_counts['directNationalId']+=1
        elif source_id in bridges and bridges[source_id][0] not in source_ids:
            old_id,distance,pdc_overlap=bridges[source_id]
            offer['stationIds']=[old_id]
            offer['metadata']['sourceIrveStationId']=source_id
            offer['metadata']['identityBridge']={
              'nationalStationId':old_id,'distanceM':round(distance,2),
              'sameNameAndOperator':True,'pdcIdOverlap':pdc_overlap
            }
            join_counts['bridgedNationalId']+=1
        else:
            join_counts['unmatchedNationalId']+=1
    out={
      "schemaVersion":1,
      "country":"FR",
      "generatedAt":manifest.get("generatedAt"),
      "mode":"pinned-electroverse-station-exact-uniform-simple",
      "policy":{
        "highConfidenceMappingOnly":True,
        "frStationsOnly":True,
        "uniformConnectorTariffRequired":True,
        "complexPricingFailClosed":True,
        "heterogeneousConnectorPricingFailClosed":True,
        "nationalIdentityBridgeRequiresUniqueExactNameOperatorWithin10mAndPdcOverlapOr1m":True
      },
      "emspOffers":offers,
      "metadata":{
        "inputCachedStations":input_rows,
        "publishedStationOffers":len(offers),
        "rejected":rejected,
        "sourceShardCount":manifest.get("shardCount"),
        "nationalJoin":dict(join_counts)
      }
    }
    op=pathlib.Path(args.out);op.parent.mkdir(parents=True,exist_ok=True)
    op.write_text(json.dumps(out,ensure_ascii=False,separators=(",",":"))+"\n")
    print(json.dumps(out["metadata"],ensure_ascii=False))
    if len(offers)<1000:
        raise SystemExit(f"too few safe Electroverse offers: {len(offers)}")

if __name__=="__main__":
    main()
