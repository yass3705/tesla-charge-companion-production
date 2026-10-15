#!/usr/bin/env python3
"""Build a read-only, lossless tariff evidence catalogue from a pinned dist.

The SQLite file is a derived audit artifact. It is never read by Production.
Only exact EVSE/connector identifiers create OfferScope links.
"""
import argparse
import gzip
import hashlib
import json
import pathlib
import re
import sqlite3
from collections import Counter, defaultdict

COUNTRIES = {'france':'FR','netherlands':'NL','spain':'ES','italy':'IT','switzerland':'CH'}
BOIS = {'FRELCP12954082','FRELCP5265355','FRELCPBDALE'}
BOIS_SITE = 'FR:electra:0a650b39-b871-4e78-9670-e56e6b20f329'

def read(path):
    with (gzip.open(path, 'rt', encoding='utf-8') if path.suffix == '.gz' else path.open(encoding='utf-8')) as stream:
        return json.load(stream)

def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for part in iter(lambda: stream.read(1024*1024), b''): h.update(part)
    return h.hexdigest()

def identity(value):
    return re.sub(r'[^A-Z0-9]', '', str(value or '').upper())

def channel(offer, bucket, path):
    provider = str(offer.get('provider','')).lower()
    if 'electroverse' in provider or '/electroverse/' in path: return 'Electroverse'
    if ('electra' in provider or '/electra/' in path) and (bucket == 'emspOffers' or '/platforms/' in path): return 'Electra'
    if bucket == 'subscriptionOffers' or offer.get('subscriptionId'): return 'DirectSubscription'
    if bucket == 'directOffers' or offer.get('kind') == 'direct': return 'Direct'
    return 'Other'

def offer_files(root):
    patterns = [
        'runtime/data/v9/*offers.json',
        'runtime/data/v9/spain-reve-offers/*.json.gz',
        'snapshot-inputs/FR/platforms/electra/*.json.gz',
        'snapshot-inputs/FR/platforms/electroverse/*.json.gz',
        'snapshot-inputs/FR/direct/*offers.json',
    ]
    return sorted({p for pattern in patterns for p in root.glob(pattern) if p.is_file()})

def create_schema(db):
    db.executescript('''
      PRAGMA journal_mode=WAL;
      CREATE TABLE Site(site_key TEXT PRIMARY KEY,country TEXT,identity_tier TEXT);
      CREATE TABLE SourceStation(station_key TEXT PRIMARY KEY,site_key TEXT,country TEXT,cpo TEXT,source_path TEXT,source_id TEXT,raw_json TEXT);
      CREATE TABLE ChargePoint(point_key TEXT PRIMARY KEY,station_key TEXT,source_evse_id TEXT,pdc_id TEXT,power_kw REAL,raw_json TEXT);
      CREATE TABLE Connector(connector_key TEXT PRIMARY KEY,point_key TEXT,source_connector_id TEXT,kind TEXT,power_kw REAL,raw_json TEXT);
      CREATE TABLE RawOffer(raw_key TEXT PRIMARY KEY,country TEXT,cpo TEXT,channel TEXT,offer_id TEXT,source_path TEXT,source_sha256 TEXT,ordinal INTEGER,raw_json TEXT);
      CREATE TABLE OfferScope(raw_key TEXT,scope_kind TEXT,source_id TEXT,point_key TEXT,connector_key TEXT,link_status TEXT,reason TEXT,
        PRIMARY KEY(raw_key,scope_kind,source_id));
      CREATE TABLE Evidence(evidence_key TEXT PRIMARY KEY,entity_key TEXT,source_path TEXT,source_sha256 TEXT,claim TEXT);
      CREATE TABLE Scenario(scenario_key TEXT PRIMARY KEY,country TEXT,raw_json TEXT);
      CREATE INDEX point_source ON ChargePoint(source_evse_id);
      CREATE INDEX connector_source ON Connector(source_connector_id);
      CREATE INDEX offer_scope_source ON OfferScope(source_id);
    ''')

def build(dist, out, scenarios_path=None):
    manifest = read(dist/'manifest.json')
    if manifest.get('snapshotId') != '2026-10-15-v9-tesla-mac-ingress-verified':
        raise ValueError('Expected pinned 2026-10-15 snapshot')
    if out.exists(): raise FileExistsError(out)
    db = sqlite3.connect(out)
    create_schema(db)
    country_stats = defaultdict(Counter)
    opaque = []
    point_lookup = defaultdict(list)
    connector_lookup = defaultdict(list)
    source_counts = Counter()

    # Compact national input is archived in a complete all.json.gz per country.
    for name, cc in COUNTRIES.items():
        path = dist/f'runtime/data/v9/{name}-static/all.json.gz'
        paths = [path]
        if cc == 'NL': paths = [dist/'runtime/data/non_tesla_netherlands/all.json.gz']
        if cc == 'CH': paths = sorted((dist/'runtime/data/v9/switzerland-static').glob('tile_*.json.gz'))
        if not paths or any(not p.exists() for p in paths):
            opaque.append({'country':cc,'source':str(path.relative_to(dist)),'reason':'missing_compact_inventory'})
            continue
        rows = [row for source in paths for row in read(source)]
        rel = ','.join(str(source.relative_to(dist)) for source in paths)
        sha = hashlib.sha256(''.join(digest(source) for source in paths).encode()).hexdigest()
        for number, row in enumerate(rows):
            if not isinstance(row, list) or not row: continue
            source_id = str(row[0]); station_key = f'{cc}:{source_id}:{number}'
            site_key = BOIS_SITE if cc == 'FR' and source_id in BOIS else station_key
            db.execute('INSERT OR IGNORE INTO Site VALUES(?,?,?)',(site_key,cc,'verified_public_id' if site_key == BOIS_SITE else 'source_station_only'))
            cpo = str(row[5] if len(row)>5 else 'Unknown')
            db.execute('INSERT INTO SourceStation VALUES(?,?,?,?,?,?,?)',(station_key,site_key,cc,cpo,rel,source_id,json.dumps(row,separators=(',',':'))))
            country_stats[cc]['sourceStations'] += 1
            for index, config in enumerate(row[8] if len(row)>8 and isinstance(row[8],list) else []):
                if not isinstance(config,list):continue
                cfg_id = str(config[0] if config else f'cfg:{index}')
                pdcs = [str(x) for x in (config[6] if len(config)>6 and isinstance(config[6],list) else [])]
                if not pdcs: pdcs = [cfg_id]
                power = config[3] if len(config)>3 and isinstance(config[3],(int,float)) else None
                kind = str(config[2] if len(config)>2 else '')
                for slot,pdc in enumerate(pdcs):
                    point_key = f'{station_key}:point:{index}:{slot}'
                    connector_key = point_key+':connector'
                    db.execute('INSERT INTO ChargePoint VALUES(?,?,?,?,?,?)',(point_key,station_key,cfg_id,pdc,power,json.dumps(config,separators=(',',':'))))
                    db.execute('INSERT INTO Connector VALUES(?,?,?,?,?,?)',(connector_key,point_key,cfg_id+':connector',kind,power,json.dumps(config,separators=(',',':'))))
                    for token in {identity(cfg_id),identity(pdc)}:
                        if token:point_lookup[(cc,token)].append(point_key)
                    connector_lookup[(cc,identity(cfg_id+':connector'))].append(connector_key)
                    country_stats[cc]['chargePoints'] += 1
                    country_stats[cc]['connectors'] += 1
        db.execute('INSERT INTO Evidence VALUES(?,?,?,?,?)',(f'file:{rel}',cc,rel,sha,'compact_inventory_exact_bytes'))

    # Tesla's pinned Mac/SuC catalogue has a distinct collection chain.
    tesla = dist/'runtime/data/tesla_stations.json'
    if tesla.exists():
        rel = str(tesla.relative_to(dist));sha = digest(tesla)
        for number,row in enumerate(read(tesla)):
            cc = str(row.get('countryCode') or '??').upper();source_id = str(row.get('id') or f'index:{number}')
            key = f'TESLA:{cc}:{source_id}:{number}'
            db.execute('INSERT INTO Site VALUES(?,?,?)',(key,cc,'tesla_source_location'))
            db.execute('INSERT INTO SourceStation VALUES(?,?,?,?,?,?,?)',(key,key,cc,'Tesla',rel,source_id,json.dumps(row,separators=(',',':'))))
            country_stats[cc]['sourceStations'] += 1
            stalls = row.get('stalls')
            if isinstance(stalls,int) and stalls>0:
                country_stats[cc]['teslaStallsWithoutIndividualId'] += stalls
            configs = row.get('chargingConfigurations') if isinstance(row.get('chargingConfigurations'),list) and row['chargingConfigurations'] else [row]
            for index,cfg in enumerate(configs):
                cfg_id = str((cfg.get('id') if cfg is not row else None) or f'{source_id}:default')
                point_key = f'{key}:point:{index}'
                connector_key = f'{point_key}:connector'
                power = cfg.get('powerKw') or row.get('powerKw')
                kind = str(cfg.get('kind') or row.get('kind') or 'DC')
                db.execute('INSERT INTO ChargePoint VALUES(?,?,?,?,?,?)',(point_key,key,cfg_id,None,power,json.dumps(cfg,separators=(',',':'))))
                db.execute('INSERT INTO Connector VALUES(?,?,?,?,?,?)',(connector_key,point_key,cfg_id+':connector',kind,power,json.dumps(cfg,separators=(',',':'))))
                point_lookup[(cc,identity(cfg_id))].append(point_key)
                connector_lookup[(cc,identity(cfg_id+':connector'))].append(connector_key)
                country_stats[cc]['chargePoints'] += 1
                country_stats[cc]['connectors'] += 1
                pricing = cfg.get('pricing') or row.get('pricing')
                if pricing:
                    raw_key = f'{rel}:{number}:pricing:{index}'
                    offer = {'id':f'tesla-direct:{cfg_id}','provider':'Tesla','kind':'direct','countries':[cc],
                             'evseIds':[cfg_id],'pricing':pricing,'sourceId':'tesla-global',
                             'sourceStationId':source_id,'sourceConfiguration':cfg_id}
                    db.execute('INSERT INTO RawOffer VALUES(?,?,?,?,?,?,?,?,?)',
                               (raw_key,cc,'Tesla','Direct',offer['id'],rel,sha,index,json.dumps(offer,separators=(',',':'))))
                    db.execute('INSERT INTO OfferScope VALUES(?,?,?,?,?,?,?)',
                               (raw_key,'EVSE',cfg_id,point_key,None,'exact_unique',None))
                    source_counts[rel] += 1
                    country_stats[cc]['rawOffers'] += 1
                    country_stats[cc]['scopeAssertions'] += 1
                    country_stats[cc]['exact_unique'] += 1
        db.execute('INSERT INTO Evidence VALUES(?,?,?,?,?)',(f'file:{rel}','Tesla',rel,sha,'pinned_mac_catalogue_exact_bytes'))

    for path in offer_files(dist):
        rel = str(path.relative_to(dist));sha = digest(path)
        payload = read(path)
        if not isinstance(payload,dict):
            opaque.append({'source':rel,'reason':'offer_payload_not_object'});continue
        cc = str(payload.get('country') or payload.get('countryCode') or '??').upper()
        for bucket in ('directOffers','subscriptionOffers','emspOffers'):
            offers = payload.get(bucket,[])
            if not isinstance(offers,list):continue
            for ordinal,offer in enumerate(offers):
                if not isinstance(offer,dict):continue
                raw_key = f'{rel}:{bucket}:{ordinal}'
                lane = channel(offer,bucket,rel)
                cpo = str(offer.get('provider') or 'Unknown')
                offer_id = str(offer.get('id') or offer.get('offerId') or '')
                db.execute('INSERT INTO RawOffer VALUES(?,?,?,?,?,?,?,?,?)',(raw_key,cc,cpo,lane,offer_id,rel,sha,ordinal,json.dumps(offer,separators=(',',':'))))
                source_counts[rel] += 1
                country_stats[cc]['rawOffers'] += 1
                for field,scope_kind,lookup in (('evseIds','EVSE',point_lookup),('connectorIds','Connector',connector_lookup)):
                    ids = offer.get(field)
                    if not isinstance(ids,list):continue
                    for source_id in {str(x) for x in ids if x is not None}:
                        matches = lookup.get((cc,identity(source_id)),[])
                        status = 'exact_unique' if len(matches)==1 else 'ambiguous_exact_id' if matches else 'unmatched_exact_id'
                        db.execute('INSERT OR IGNORE INTO OfferScope VALUES(?,?,?,?,?,?,?)',
                            (raw_key,scope_kind,source_id,matches[0] if len(matches)==1 and scope_kind=='EVSE' else None,
                             matches[0] if len(matches)==1 and scope_kind=='Connector' else None,status,
                             None if matches else 'source_identifier_absent_from_compact_inventory'))
                        country_stats[cc]['scopeAssertions'] += 1
                        country_stats[cc][status] += 1
                if not offer.get('evseIds') and not offer.get('connectorIds'):
                    db.execute('INSERT INTO OfferScope VALUES(?,?,?,?,?,?,?)',(raw_key,'Unscoped','',None,None,'unscoped','no_exact_evse_or_connector_id'))
                    country_stats[cc]['unscopedOffers'] += 1
        db.execute('INSERT INTO Evidence VALUES(?,?,?,?,?)',(f'file:{rel}',cc,rel,sha,'raw_offers_exact_bytes'))
    # Runtime source registry is the completeness ledger: unparsed embedded
    # tariff sources remain explicit gaps, never silently counted as zero.
    registry = read(dist/'runtime/data/v9/source-registry.json')
    supported = {'direct-offer-json','direct-offer-sharded-v1','france-emsp-compact-v1'}
    for source in registry.get('sources',[]):
        caps = source.get('capabilities') or []
        if 'tariff' in caps and source.get('adapter') not in supported:
            opaque.append({'sourceId':source.get('id'),'countries':source.get('countries'),
                           'adapter':source.get('adapter'),'reason':'embedded_or_adapter_tariffs_not_normalized_in_v1_catalog'})
        raw_path = source.get('path')
        if raw_path:
            candidates = [dist/'runtime'/raw_path,dist/raw_path]
            asset = next((candidate.resolve() for candidate in candidates if candidate.is_file()),None)
            if asset and asset.is_relative_to(dist.resolve()):
                rel = str(asset.relative_to(dist.resolve()))
                db.execute('INSERT OR IGNORE INTO Evidence VALUES(?,?,?,?,?)',
                           (f'file:{rel}',source.get('id'),rel,digest(asset),'registry_source_exact_bytes'))
    if scenarios_path:
        scenario_spec = read(scenarios_path)
        if scenario_spec.get('snapshotId') != manifest['snapshotId']:raise ValueError('Scenario pin differs from dist')
        for scenario in scenario_spec.get('scenarios',[]):
            db.execute('INSERT INTO Scenario VALUES(?,?,?)',
                       (scenario['key'],scenario['countryCode'],json.dumps({'spec':scenario,'session':scenario_spec['session']},separators=(',',':'))))
    db.commit()
    before = db.execute('SELECT COUNT(*) FROM RawOffer').fetchone()[0]
    after = db.execute('SELECT COUNT(DISTINCT raw_key) FROM RawOffer').fetchone()[0]
    assert before == after == sum(source_counts.values())
    by_cpo = []
    for cc,cpo,lane,count in db.execute('SELECT country,cpo,channel,COUNT(*) FROM RawOffer GROUP BY country,cpo,channel ORDER BY country,cpo,channel'):
        by_cpo.append({'country':cc,'cpo':cpo,'channel':lane,'rawOffers':count})
    report = {'snapshotId':manifest['snapshotId'],'manifestFileCount':manifest['fileCount'],
              'catalogue':{'rawOffersBefore':before,'rawOffersAfter':after,'rawOfferLoss':before-after,
                           'sourceFiles':len(source_counts)},
              'byCountry':{k:dict(v) for k,v in sorted(country_stats.items())},
              'byCountryCpoChannel':by_cpo,
              'missingData':opaque,'note':'Scope links are exact-ID only. Opaque embedded tariff adapters are not counted as zero offers.'}
    db.close()
    return report

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('dist',type=pathlib.Path)
    ap.add_argument('--database',type=pathlib.Path,required=True)
    ap.add_argument('--report',type=pathlib.Path,required=True)
    ap.add_argument('--scenarios',type=pathlib.Path)
    args=ap.parse_args()
    result=build(args.dist,args.database,args.scenarios)
    args.report.write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n')
    print(json.dumps({'snapshotId':result['snapshotId'],'catalogue':result['catalogue'],'countries':list(result['byCountry'])}))

if __name__=='__main__':main()
