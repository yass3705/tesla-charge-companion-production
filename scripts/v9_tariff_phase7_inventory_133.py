#!/usr/bin/env python3
"""One read-only, pin-wide census. Never uses site_key to assign tariffs."""
import argparse
import hashlib
import json
import math
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path

PIN='2026-10-15-v9-tesla-mac-ingress-verified'
EXACT={'exact_unique','source_exact_join'}
COUNTS={'RawOffer':666631,'OfferScope':710386,'SourceStation':362234,'ChargePoint':654932,'Connector':460144}

def family(raw):
    try:
        value=json.loads(raw)
    except (TypeError,ValueError):
        return 'invalid_json'
    if isinstance(value,list): return 'compact_array'
    if not isinstance(value,dict): return 'scalar'
    pricing=value.get('pricing')
    if isinstance(pricing,dict):return str(pricing.get('type') or value.get('kind') or 'pricing_unspecified')
    return 'embedded_fields' if any(k in value for k in ('pricePerKwhEur','price_per_kwh','pricePerKwh','tariff')) else 'unknown'

def latlon(raw):
    try:v=json.loads(raw)
    except (TypeError,ValueError):return None
    if isinstance(v,list) and len(v)>4:a,b=v[3:5]
    elif isinstance(v,dict):
        a=v.get('latitude',v.get('lat'));b=v.get('longitude',v.get('lon'))
        if (a is None or b is None) and isinstance(v.get('coordinates'),dict):
            a=v['coordinates'].get('latitude',v['coordinates'].get('lat'))
            b=v['coordinates'].get('longitude',v['coordinates'].get('lon'))
    else:return None
    try:
        a=float(a);b=float(b)
        return (a,b) if -90<=a<=90 and -180<=b<=180 else None
    except (TypeError,ValueError):return None

def inside(lat,lon,spec):
    a,b=map(math.radians,(lat,spec['origin']['lat'])); dlat=b-a
    dlon=math.radians(spec['origin']['lon']-lon)
    x=math.sin(dlat/2)**2+math.cos(a)*math.cos(b)*math.sin(dlon/2)**2
    return 12742*math.asin(min(1,math.sqrt(x)))<=spec['radiusKm']

def state():
    return {'rawOfferCount':0,'offerScopeCount':0,'scopeStatuses':Counter(),
            'exactStationKeys':set(),'exactPointKeys':set(),'exactConnectorKeys':set(),
            'exactTupleDigests':set(),'rawKeysSha256':hashlib.sha256(),
            'sourcePaths':Counter(),'families':Counter()}

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('database',type=Path);ap.add_argument('scenarios',type=Path)
    ap.add_argument('phase6_matrix',type=Path);ap.add_argument('phase6_dualrun',type=Path)
    ap.add_argument('output',type=Path)
    args=ap.parse_args()
    scenarios=json.loads(args.scenarios.read_text())['scenarios']
    zones=defaultdict(list)
    for s in scenarios:
        if s.get('origin') and s.get('source')!='tesla':zones[s['countryCode']].append(s)
    db=sqlite3.connect(f'file:{args.database}?mode=ro',uri=True)
    actual={t:db.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0] for t in COUNTS}
    assert actual==COUNTS,actual
    stations={};station_country=Counter();station_operator=Counter();geo=defaultdict(Counter)
    for key,country,cpo,raw in db.execute('SELECT station_key,country,cpo,raw_json FROM SourceStation'):
        coord=latlon(raw);in_zone=coord is not None and any(inside(*coord,s) for s in zones[country])
        stations[key]=(country,cpo,in_zone)
        station_country[country]+=1;station_operator[(country,cpo)]+=1
        geo[country]['with_coordinates' if coord else 'without_coordinates']+=1
        if coord:geo[country]['inside_fixed_query_radius' if in_zone else 'outside_fixed_query_radius']+=1
    points={};point_connectors=defaultdict(list);point_country=Counter()
    for key,station_key in db.execute('SELECT point_key,station_key FROM ChargePoint'):
        points[key]=station_key
        point_country[stations[station_key][0]]+=1
    connectors={};connector_country=Counter()
    for key,point_key in db.execute('SELECT connector_key,point_key FROM Connector'):
        connectors[key]=point_key;point_connectors[point_key].append(key)
        connector_country[stations[points[point_key]][0]]+=1
    groups=defaultdict(state);totals=Counter();global_digest={name:hashlib.sha256() for name in ('RawOffer','OfferScope','SourceStation','ChargePoint','Connector')}
    # Stable key hashes prove that every identifier is preserved across reruns.
    for table,column in [('SourceStation','station_key'),('ChargePoint','point_key'),('Connector','connector_key')]:
        for (key,) in db.execute(f'SELECT {column} FROM {table} ORDER BY {column}'):
            global_digest[table].update(key.encode()+b'\n')
    cursor=db.execute('''SELECT r.raw_key,r.country,r.cpo,r.channel,r.offer_id,r.source_path,r.raw_json,
        s.scope_kind,s.source_id,s.point_key,s.connector_key,s.link_status
        FROM RawOffer r LEFT JOIN OfferScope s ON s.raw_key=r.raw_key
        ORDER BY r.raw_key,s.scope_kind,s.source_id''')
    last=None
    for raw_key,country,cpo,channel,offer_id,path,raw,kind,source_id,point_key,connector_key,status in cursor:
        if raw_key!=last:
            fam=family(raw);cohort=(PIN,country,cpo,channel,fam)
            entry=groups[cohort];entry['rawOfferCount']+=1;entry['rawKeysSha256'].update(raw_key.encode()+b'\n')
            entry['sourcePaths'][path]+=1
            global_digest['RawOffer'].update(raw_key.encode()+b'\n')
            totals['RawOffer']+=1;last=raw_key
        entry=groups[cohort]
        if kind is None:continue
        entry['offerScopeCount']+=1;entry['scopeStatuses'][status]+=1;totals['OfferScope']+=1
        global_digest['OfferScope'].update(json.dumps([raw_key,kind,source_id],ensure_ascii=False,separators=(',',':')).encode()+b'\n')
        if status not in EXACT:continue
        if point_key and point_key in points:
            target_points=[point_key]
            target_connectors=point_connectors.get(point_key,[])
        elif connector_key and connector_key in connectors:
            target_points=[connectors[connector_key]];target_connectors=[connector_key]
        else:
            continue
        for p in target_points:
            entry['exactPointKeys'].add(p);entry['exactStationKeys'].add(points[p])
        for c in target_connectors:
            entry['exactConnectorKeys'].add(c)
            # Exact tuple = source RawOffer + exact source PDC/connector, no physical site join.
            entry['exactTupleDigests'].add(hashlib.blake2b((raw_key+'\x1f'+connectors[c]+'\x1f'+c).encode(),digest_size=16).digest())
    assert totals['RawOffer']==COUNTS['RawOffer'] and totals['OfferScope']==COUNTS['OfferScope'],totals
    observed=json.loads(args.phase6_matrix.read_text())
    observed_keys={tuple(row['key']) for row in observed['matrix']}
    runtime=json.loads(args.phase6_dualrun.read_text())
    runtime_crosswalk=defaultdict(lambda:{'sampleRows':0,'catalogueKeys':set(),'missingRawKey':0})
    for row in runtime['rows']:
        runtime_key=(PIN,row['country'],row.get('cpo'),row.get('channel'),row.get('tariffFamily'))
        item=runtime_crosswalk[runtime_key];item['sampleRows']+=1
        proof=row.get('catalogueProof') or {}
        raw_keys=[proof['rawKey']] if proof.get('rawKey') else []
        raw_keys.extend(x['rawKey'] for x in (proof.get('equivalentRawOffers') or []))
        for raw_key in raw_keys:
            found=db.execute('SELECT country,cpo,channel,raw_json FROM RawOffer WHERE raw_key=?',(raw_key,)).fetchone()
            if found:item['catalogueKeys'].add((PIN,found[0],found[1],found[2],family(found[3])))
            else:item['missingRawKey']+=1
        if not raw_keys:item['missingRawKey']+=1
    results=[];country_summary=defaultdict(Counter)
    for key,value in sorted(groups.items(),key=lambda kv:json.dumps(kv[0],ensure_ascii=False)):
        station_keys=value['exactStationKeys']
        row={'key':key,'rawOfferCount':value['rawOfferCount'],'offerScopeCount':value['offerScopeCount'],
            'scopeStatuses':dict(sorted(value['scopeStatuses'].items())),
            'exactStationCount':len(station_keys),'exactPointCount':len(value['exactPointKeys']),
            'exactConnectorCount':len(value['exactConnectorKeys']),
            'uniqueExactSourceTuples':len(value['exactTupleDigests']),
            'exactStationsInsideFixedQueryRadii':sum(stations[s][2] for s in station_keys),
            'rawKeysSha256':value['rawKeysSha256'].hexdigest(),
            'sourcePathCount':len(value['sourcePaths']),'observedPhase6KeyExact':key in observed_keys}
        results.append(row)
        country_summary[key[1]]['rawOffers']+=row['rawOfferCount']
        country_summary[key[1]]['exactSourceTuples']+=row['uniqueExactSourceTuples']
        country_summary[key[1]]['cohorts']+=1
        if key in observed_keys:country_summary[key[1]]['cohortsExactKeyObservedPhase6']+=1
    result={'snapshotId':PIN,'catalogueCounts':actual,
        'sourceStationByCountry':dict(sorted(station_country.items())),
        'chargePointByCountry':dict(sorted(point_country.items())),
        'connectorByCountry':dict(sorted(connector_country.items())),
        'sourceStationGeographyByCountry':{k:dict(v) for k,v in sorted(geo.items())},
        'countrySummary':{k:dict(v) for k,v in sorted(country_summary.items())},
        'globalIdentifierSha256':{k:v.hexdigest() for k,v in global_digest.items()},
        'cohorts':results,'phase6ObservedCohorts':len(observed_keys),
        'exactKeyOverlapWithPhase6':sum(r['observedPhase6KeyExact'] for r in results),
        'runtimeToCatalogueCrosswalk':[
            {'runtimeKey':key,'sampleRows':value['sampleRows'],
             'catalogueKeys':sorted(value['catalogueKeys'],key=lambda x:json.dumps(x,ensure_ascii=False)),
             'missingRawKey':value['missingRawKey']}
            for key,value in sorted(runtime_crosswalk.items(),key=lambda kv:json.dumps(kv[0],ensure_ascii=False))],
        'runtimeCohortsWithUniqueCatalogueCohort':sum(len(v['catalogueKeys'])==1 and not v['missingRawKey'] for v in runtime_crosswalk.values()),
        'catalogueCohortsRepresentedBySample':len(set.union(set(),*(v['catalogueKeys'] for v in runtime_crosswalk.values()))),
        'limitations':['Catalogue cpo/channel/family labels may differ from runtime labels; exact-key comparison is not an alias join.',
            'Station-only, ambiguous, unmatched and unscoped OfferScope records remain without an exact connector tuple.',
            'Fixed query radii exclude dynamic Tesla locations and name/id filters; inside-radius is an upper bound on Phase 6 geographic coverage.',
            'Catalogue has no sessions; repeated session occurrences are counted only in the Phase 6/7 query replay.']}
    args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'cohorts':len(results),'rawOffers':totals['RawOffer'],'scopes':totals['OfferScope'],
        'exactKeyOverlapWithPhase6':result['exactKeyOverlapWithPhase6'],
        'catalogueCohortsRepresentedBySample':result['catalogueCohortsRepresentedBySample']}))
if __name__=='__main__':main()
