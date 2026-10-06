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
        name_key=normalized(irve.get('name'))
        operator_key=normalized(irve.get('operator'))
        if not name_key or not operator_key:continue
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
                    if normalized(row[1])!=name_key:continue
                    if normalized(row[5])!=operator_key:continue
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

COMPONENTS={"ConsumptionRate":"energy","TimeRate":"chargingMinute","ParkingTimeRate":"parkingMinute","ConnectionFee":"flat"}
RESTRICTIONS={"TIME_BASED","DURATION_BASED","DATE_BASED","WEEKDAY_BASED","WEEKEND_BASED"}

def component_rates(components):
    values={"energy":0.0,"chargingMinute":0.0,"parkingMinute":0.0,"flat":0.0}
    seen=set()
    for component in components or []:
        typ=str(component.get("__typename") or "")
        if typ=="VAT":continue
        key=COMPONENTS.get(typ)
        if not key or key in seen:return None,"unsupported_or_duplicate_component"
        value=parse_money(component.get("formattedValue"))
        if value is None or not math.isfinite(value) or value<0:return None,"invalid_component_price"
        values[key]=round(value,6);seen.add(key)
    if not seen:return None,"no_price_components"
    return values,None

def time_value(value):
    if not isinstance(value,str) or not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?",value):return None
    return value[:5]

def date_value(value):
    if value is None:return None
    if not isinstance(value,str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}",value):return False
    return value

def connector_policy(conn):
    detail=conn.get("complexPricingDetail")
    base,reason=component_rates(conn.get("priceComponents"))
    if reason:return None,reason
    if not detail:
        return {"type":"electroverse_restrictions","version":1,"fallbackRates":base,"rules":[{"types":[],"rates":base,"components":sorted(base)}]},None
    if not isinstance(detail,dict) or detail.get("currency")!="EUR":return None,"unsupported_complex_currency"
    raw_rules=detail.get("restrictions")
    if not isinstance(raw_rules,list) or not raw_rules:return None,"missing_complex_restrictions"
    rules=[]
    for raw in raw_rules:
        if not isinstance(raw,dict):return None,"invalid_complex_restriction"
        types=raw.get("restrictionTypes") or []
        if not isinstance(types,list) or len(types)!=len(set(types)) or not set(types)<=RESTRICTIONS:return None,"unsupported_restriction_type"
        rates,reason=component_rates(raw.get("priceComponents"))
        if reason:return None,reason
        named={COMPONENTS.get(str(c.get("__typename") or "")) for c in raw.get("priceComponents") or []}
        rule={"types":sorted(types),"rates":rates,"components":sorted(named)}
        if "TIME_BASED" in types:
            t=raw.get("timeRestrictions") or {}
            start,end=time_value(t.get("startTime")),time_value(t.get("endTime"))
            if not start or not end or start==end:return None,"invalid_time_restriction"
            rule.update(startTime=start,endTime=end)
        if "DURATION_BASED" in types:
            d=raw.get("durationRestrictions") or {}
            low,high=d.get("minDurationSeconds"),d.get("maxDurationSeconds")
            if low is None and high is None:return None,"empty_duration_restriction"
            if any(v is not None and (not isinstance(v,(int,float)) or v<0 or not math.isfinite(v)) for v in (low,high)):return None,"invalid_duration_restriction"
            if low is not None and high is not None and low>=high:return None,"invalid_duration_restriction"
            rule.update(minDurationSeconds=low,maxDurationSeconds=high)
        if "DATE_BASED" in types:
            d=raw.get("dateRestrictions") or {}
            start,end=date_value(d.get("startDate")),date_value(d.get("endDate"))
            if start is False or end is False or (start is None and end is None) or (start and end and start>end):return None,"invalid_date_restriction"
            if start and end and start==end:continue  # Empty historical interval; never active.
            rule.update(startDate=start,endDate=end)
        if "WEEKDAY_BASED" in types or "WEEKEND_BASED" in types:
            days=(raw.get("weekdayRestrictions") or {}).get("daysOfWeek")
            if not isinstance(days,list) or not days or any(day not in {"MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY","SATURDAY","SUNDAY"} for day in days):return None,"invalid_weekday_restriction"
            rule["daysOfWeek"]=sorted(set(days))
        rules.append(rule)
    return {"type":"electroverse_restrictions","version":1,"fallbackRates":base,"rules":rules},None

def connector_kind(conn):
    standard=str((conn.get("standard") or {}).get("name") or "")
    if "COMBO" in standard or standard=="CHADEMO":return "DC"
    if standard.startswith("IEC_62196") or standard.startswith("DOMESTIC_"):return "AC"
    return None

def station_offers(row):
    station_id=str(row.get("irveStationId") or "").strip()
    if not station_id.startswith("FR"): return None,"not_fr"
    if str(row.get("matchConfidence") or "").lower()!="high": return None,"not_high_confidence"
    tariff=row.get("tariff") or {}
    connectors=[]
    for evse in tariff.get("evses") or []:
        connectors.extend(evse.get("connectors") or [])
    if not connectors:return None,"no_connectors"
    parsed=[]
    for conn in connectors:
        policy,reason=connector_policy(conn)
        if reason:return None,reason
        kind=connector_kind(conn)
        power=conn.get("kilowatts")
        if not kind or not isinstance(power,(int,float)) or not math.isfinite(power) or power<=0:return None,"invalid_connector_identity"
        parsed.append((policy,kind,int(round(power))))
    signatures={json.dumps(item[0],sort_keys=True,separators=(",",":")) for item in parsed}
    groups={}
    if len(signatures)==1:
        groups[(None,None)]=(parsed[0][0],len(parsed))
    else:
        by_power=collections.defaultdict(list)
        for policy,kind,power in parsed:by_power[(kind,power)].append(policy)
        for key,policies in by_power.items():
            if len({json.dumps(p,sort_keys=True,separators=(",",":")) for p in policies})!=1:return None,"same_power_tariff_collision"
            groups[key]=(policies[0],len(policies))
    offers=[]
    for (kind,power),(policy,count) in groups.items():
        offer={
          "id":f"electroverse:{row.get('electroverseLocationPk')}"+(f":{kind}:{power}" if kind else ""),
          "provider":"Electroverse","stationIds":[station_id],"countries":["FR"],
          "currency":"EUR","priority":80,"pricing":policy,
          "metadata":{"verified":True,"matchPolicy":"high_confidence_irve_station_mapping_plus_connector_pricing",
            "electroverseLocationPk":str(row.get("electroverseLocationPk") or ""),
            "tariffHash":row.get("tariffHash"),"fetchedAt":row.get("fetchedAt"),"connectorCount":count,
            "timeZone":"Europe/Paris"}
        }
        if kind:
            offer.update(connectorKinds=[kind],minPowerKw=power-0.5,maxPowerKw=power+0.5)
        offers.append(offer)
    return offers,None

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
            station_rules,reason=station_offers(row)
            if station_rules is None:
                rejected[reason]=rejected.get(reason,0)+1
                continue
            sid=station_rules[0]["stationIds"][0]
            if sid in seen_station:
                rejected["duplicate_irve_station_id"]=rejected.get("duplicate_irve_station_id",0)+1
                continue
            seen_station.add(sid);offers.extend(station_rules)
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
      "mode":"pinned-electroverse-station-exact-simple-and-complex",
      "policy":{
        "highConfidenceMappingOnly":True,
        "frStationsOnly":True,
        "heterogeneousConnectorTariffRequiresDistinctPowerOrKind":True,
        "unsupportedOrAmbiguousComplexPricingFailClosed":True,
        "nationalIdentityBridgeRequiresUniqueExactNameOperatorWithin10mAndPdcOverlapOr1m":True
      },
      "emspOffers":offers,
      "metadata":{
        "inputCachedStations":input_rows,
        "publishedStationOffers":len(seen_station),
        "publishedOffers":len(offers),
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
