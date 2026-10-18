#!/usr/bin/env python3
"""Append pinned embedded tariffs to a COPY of the #136 evidence catalogue.

Every RawOffer keeps the exact JSON leaf and JSON pointer of its source file.
Only an identifier explicitly present in that source may create a point link.
Station prices remain station scoped and cannot price a connector.
"""
import argparse
import gzip
import hashlib
import json
import pathlib
import sqlite3
from collections import Counter, defaultdict

PIN = '2026-10-15-v9-tesla-mac-ingress-verified'

def read(path):
    with (gzip.open(path, 'rt', encoding='utf-8') if path.suffix == '.gz' else path.open(encoding='utf-8')) as stream:
        return json.load(stream)

def sha256(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for part in iter(lambda: stream.read(1024*1024), b''):
            h.update(part)
    return h.hexdigest()

def pointer(*parts):
    return '/' + '/'.join(str(x).replace('~', '~0').replace('/', '~1') for x in parts)

def nonempty(value):
    return value is not None and value != '' and value != [] and value != {}

def resolve(root, value):
    if not value:
        return None
    for base in (root/'runtime', root):
        path = (base/value).resolve()
        if path.is_file() and path.is_relative_to(root.resolve()):
            return path
    return None

def source_paths(root, source):
    sid = source['id']
    if sid == 'netherlands-dotnl-national':
        # The old runtime file is retained for history, but the active
        # registry reads the separately pinned national source below.
        return [root/'runtime/data/non_tesla_netherlands/all.json.gz',
                root/'snapshot-inputs/NL/runtime/all.json.gz']
    if sid == 'belgium-nap-national':
        return sorted((root/'snapshot-inputs/BE/pages').glob('*.json.gz'))
    values = [source.get('path'), *(source.get('paths') or {}).values()]
    return [p for p in (resolve(root, value) for value in values) if p]

class Importer:
    def __init__(self, root, database):
        self.root, self.db = root, sqlite3.connect(database)
        self.db.execute('PRAGMA journal_mode=WAL')
        self.before = self.db.execute('SELECT COUNT(*) FROM RawOffer').fetchone()[0]
        self.before_evidence = self.db.execute('SELECT COUNT(*) FROM Evidence').fetchone()[0]
        self.counts = defaultdict(Counter)
        self.status = {}
        self.file_count = 0
        self.scope_count = 0
        self.ordinal = 0
        self.sid = self.cc = self.cpo = self.rel = self.sha = None

    def file(self, source, path):
        self.sid = source['id']
        self.cc = (source.get('countries') or ['??'])[0]
        self.cpo = source.get('label') or self.sid
        self.rel = str(path.relative_to(self.root))
        self.sha = sha256(path)
        self.file_count += 1
        evidence_id='file:'+self.rel
        existing=self.db.execute('SELECT source_sha256 FROM Evidence WHERE evidence_key=?',(evidence_id,)).fetchone()
        if existing and existing[0]!=self.sha:
            evidence_id+=':'+self.sha
        self.db.execute('INSERT OR IGNORE INTO Evidence VALUES(?,?,?,?,?)',
                        (evidence_id,self.sid,self.rel,self.sha,'embedded_source_exact_bytes'))

    def inventory(self, station_id, evse_id=None, connector_id=None, station_raw=None, point_raw=None, connector_raw=None):
        if not nonempty(station_id):
            return None, None, None
        station_id = str(station_id)
        station_key = f'embedded:{self.sid}:{self.rel}:{station_id}'
        self.db.execute('INSERT OR IGNORE INTO Site VALUES(?,?,?)',(station_key,self.cc,'source_station_only'))
        self.db.execute('INSERT OR IGNORE INTO SourceStation VALUES(?,?,?,?,?,?,?)',
                        (station_key,station_key,self.cc,self.cpo,self.rel,station_id,
                         json.dumps(station_raw if station_raw is not None else {'sourceStationId':station_id},separators=(',',':'))))
        if not nonempty(evse_id) and not nonempty(connector_id):
            return station_key, None, None
        point_id = str(evse_id) if nonempty(evse_id) else 'connector-only:'+str(connector_id)
        point_key = station_key+':point:'+point_id
        self.db.execute('INSERT OR IGNORE INTO ChargePoint VALUES(?,?,?,?,?,?)',
                        (point_key,station_key,str(evse_id) if nonempty(evse_id) else None,None,None,
                         json.dumps(point_raw if point_raw is not None else {'sourceEvseId':evse_id},separators=(',',':'))))
        if not nonempty(connector_id):
            return station_key, point_key, None
        connector_key = point_key+':connector:'+str(connector_id)
        self.db.execute('INSERT OR IGNORE INTO Connector VALUES(?,?,?,?,?,?)',
                        (connector_key,point_key,str(connector_id),None,None,
                         json.dumps(connector_raw if connector_raw is not None else {'sourceConnectorId':connector_id},separators=(',',':'))))
        return station_key, point_key, connector_key

    def offer(self, ptr, raw, *, offer_id=None, channel='Direct', cpo=None, scopes=(), semantic='source_raw'):
        node = self.payload
        for part in ptr.lstrip('/').split('/'):
            part = part.replace('~1','/').replace('~0','~')
            node = node[int(part)] if isinstance(node,list) else node[part]
        if node != raw:
            raise ValueError(f'JSON pointer payload mismatch: {self.rel}:{ptr}')
        raw_key = self.rel+':'+ptr
        self.ordinal += 1
        self.db.execute('INSERT INTO RawOffer VALUES(?,?,?,?,?,?,?,?,?)',
                        (raw_key,self.cc,str(cpo or self.cpo),channel,str(offer_id or self.sid+':'+ptr),
                         self.rel,self.sha,self.ordinal,json.dumps(raw,ensure_ascii=False,separators=(',',':'))))
        self.counts[self.sid]['rawOffersAdded'] += 1
        self.counts[self.sid]['sourceCandidateOffers'] += 1
        self.counts[self.sid]['semantic:'+semantic] += 1
        if not scopes:
            self.db.execute('INSERT INTO OfferScope VALUES(?,?,?,?,?,?,?)',
                            (raw_key,'Unscoped','',None,None,'unscoped','source_does_not_assert_station_or_point'))
            self.counts[self.sid]['unscoped'] += 1
            return
        resolved = []
        for station_id,evse_id,connector_id,station_raw,point_raw,connector_raw in scopes:
            station_key,point_key,connector_key = self.inventory(station_id,evse_id,connector_id,station_raw,point_raw,connector_raw)
            if connector_key:
                source_id=json.dumps({'stationId':str(station_id),'evseId':str(evse_id) if nonempty(evse_id) else None,
                                      'connectorId':str(connector_id)},separators=(',',':'),sort_keys=True)
                kind,status,target_point,target_connector = 'Connector','source_exact_join',None,connector_key
            elif point_key:
                source_id=json.dumps({'stationId':str(station_id),'evseId':str(evse_id)},separators=(',',':'),sort_keys=True)
                kind,status,target_point,target_connector = 'EVSE','source_exact_join',point_key,None
            elif station_key:
                kind,source_id,status,target_point,target_connector = 'Station',str(station_id),'station_only_no_point_link',None,None
            else:
                kind,source_id,status,target_point,target_connector = 'Unscoped','','unscoped',None,None
            resolved.append((kind,source_id,status,target_point,target_connector))
        targets=defaultdict(set)
        for kind,source_id,_,point,connector in resolved:
            targets[(kind,source_id)].add(point or connector)
        seen=set()
        for kind,source_id,status,target_point,target_connector in resolved:
            dedup=(kind,source_id)
            if dedup in seen:continue
            seen.add(dedup)
            if len(targets[dedup])>1:
                status,target_point,target_connector='ambiguous_exact_id',None,None
                self.counts[self.sid]['repeatedScopeIdentifier'] += len(targets[dedup])
            self.db.execute('INSERT INTO OfferScope VALUES(?,?,?,?,?,?,?)',
                            (raw_key,kind,source_id,target_point,target_connector,status,
                             None if status=='source_exact_join' else 'no_exact_evse_or_connector_evidence'))
            self.counts[self.sid][status] += 1
            self.scope_count += 1

    @staticmethod
    def scope(station=None,evse=None,connector=None,station_raw=None,point_raw=None,connector_raw=None):
        return (station,evse,connector,station_raw,point_raw,connector_raw)

    def extract(self, payload):
        sid=self.sid
        if sid in ('ionity-direct-france','atlante-direct-france','italy-atlante-r8'):
            for li,loc in enumerate(payload.get('locations',[])):
                station=loc.get('locationId') or loc.get('id')
                for ci,con in enumerate(loc.get('connectors',[])):
                    evse=con.get('sourceEvseId') or con.get('evseId')
                    connector=con.get('uuid') or con.get('id') or con.get('connectorId')
                    scopes=[self.scope(station,evse,connector,loc,con,con)]
                    tariffs=con.get('tariffs')
                    if isinstance(tariffs,list) and tariffs:
                        for ti,tariff in enumerate(tariffs):
                            ids=tariff.get('identifiers') or {}
                            exact=[self.scope(station,ids.get('evseId') or evse,ids.get('connectorId') or connector,loc,con,con)]
                            self.offer(pointer('locations',li,'connectors',ci,'tariffs',ti),tariff,
                                       offer_id=tariff.get('id'),scopes=exact)
                    elif nonempty(con.get('pricePerKwhEur')):
                        self.offer(pointer('locations',li,'connectors',ci),con,
                                   scopes=scopes)
        elif sid=='powerdot-direct-france':
            for i,row in enumerate(payload.get('chargers',[])):
                station=(row.get('location') or {}).get('id')
                pdcs=row.get('irvePdcIds') or []
                for j,con in enumerate((row.get('charger') or {}).get('connectors',[])):
                    tariff=con.get('tariff')
                    if not isinstance(tariff,dict):continue
                    evse=pdcs[0] if len(pdcs)==1 else None
                    connector=con.get('physicalReference') or con.get('connectorNumber')
                    self.offer(pointer('chargers',i,'charger','connectors',j,'tariff'),tariff,
                               offer_id=tariff.get('id'),scopes=[self.scope(station,evse,connector,row,con,con)],
                               semantic='ambiguous_pdc' if len(pdcs)>1 else 'source_raw')
        elif sid in ('belib-direct-france','e55c-direct-france'):
            refs=defaultdict(list)
            for station in payload.get('stations',[]):
                station_id=station.get('stationId')
                for cfg in station.get('configurations',[]):
                    profiles=cfg.get('pricingProfileIds') or ([cfg['pricingProfileId']] if cfg.get('pricingProfileId') else [])
                    for pid in profiles:
                        for evse in cfg.get('evseIds',[]):
                            refs[pid].append(self.scope(station_id,evse,None,station,cfg,None))
            for pid,profile in (payload.get('profiles') or {}).items():
                self.offer(pointer('profiles',pid),profile,offer_id=pid,
                           channel='DirectSubscription' if profile.get('subscriptionId') else 'Direct',
                           scopes=refs.get(pid,()),semantic='profile_exact_references' if refs.get(pid) else 'unreferenced_profile')
        elif sid=='etotem-direct-france':
            for i,station in enumerate(payload.get('stations',[])):
                station_id=station.get('stationId')
                if nonempty(station.get('tariffText')) or nonempty(station.get('tariffHints')):
                    self.offer(pointer('stations',i),station,
                               scopes=[self.scope(station_id,None,None,station,None,None)],semantic='hints_not_contract')
                for j,pdc in enumerate(station.get('pdcs',[])):
                    if nonempty(pdc.get('tarificationRaw')) or any(nonempty(v) for v in (pdc.get('tariffHints') or {}).values()):
                        self.offer(pointer('stations',i,'pdcs',j),pdc,
                                   scopes=[self.scope(station_id,pdc.get('id'),None,station,pdc,None)],semantic='hints_not_contract')
            for i,profile in enumerate(payload.get('tariffProfiles',[])):
                self.offer(pointer('tariffProfiles',i),profile,offer_id=profile.get('id'),semantic='profile_without_exact_reference')
        elif sid=='morocco-evgo-native':
            for i,station in enumerate(payload.get('stations',[])):
                for j,evse in enumerate(station.get('evses',[])):
                    if evse.get('tariffId') is None and evse.get('priceMAD') is None:continue
                    semantic='native_price' if evse.get('tariffId') is not None else 'policy_derived_zero'
                    self.offer(pointer('stations',i,'evses',j),evse,
                               scopes=[self.scope(station.get('locationId'),evse.get('id'),None,station,evse,None)],semantic=semantic)
        elif sid=='morocco-fastvolt-public':
            # The map contains inventory and a channel label, no price. The
            # independently pinned policy is recorded as one network offer.
            policy=self.root/'snapshot-inputs/MA/sources/fastvolt-tariff-policy.json'
            if policy.exists():
                self.file({'id':sid,'countries':['MA'],'label':'FastVolt direct'},policy)
                document=read(policy)
                self.payload=document
                for i,evidence in enumerate(document.get('evidence',[])):
                    claim=evidence.get('claims') or {}
                    if nonempty(claim.get('displayed_tariff_mad_per_hour')):
                        self.offer(pointer('evidence',i,'claims'),claim,
                                   channel='Direct',semantic='network_policy_no_station_scope')
        elif sid=='morocco-kilowatt-public':
            for i,station in enumerate(payload.get('stations',[])):
                for j,con in enumerate(station.get('connectors',[])):
                    if con.get('rate_price') is None and not con.get('rate_id'):continue
                    self.offer(pointer('stations',i,'connectors',j),con,
                               offer_id=con.get('rate_id'),scopes=[self.scope(station.get('station_id'),con.get('chargestation_id'),con.get('id'),station,con,con)])
        elif sid=='morocco-totalenergies-hosts':
            for i,station in enumerate(payload.get('results',[])):
                for j,con in enumerate(station.get('connectors',[])):
                    if con.get('rate') is None:continue
                    self.offer(pointer('results',i,'connectors',j),con,
                               scopes=[self.scope(station.get('station_id'),con.get('ChargePointID') or con.get('chargePointId'),
                                                  con.get('ConnectorID') or con.get('connector_id') or con.get('id'),station,con,con)])
        elif sid=='morocco-shell-al-jazira':
            if nonempty(payload.get('tariff')):
                station=payload.get('station') or {}
                self.offer('/tariff',payload['tariff'],scopes=[self.scope(station.get('id') or station.get('stationId'),None,None,station,None,None)])
        elif sid=='germany-production-snapshot':
            for i,site in enumerate(payload.get('sites',[])):
                pricing=site.get('pricing') or {}
                station=site.get('id')
                for bucket in ('rawAfirTariffs','subscriptions','emspFallback'):
                    for j,tariff in enumerate(pricing.get(bucket) or []):
                        self.offer(pointer('sites',i,'pricing',bucket,j),tariff,
                                   channel='DirectSubscription' if bucket=='subscriptions' else 'Other' if bucket=='emspFallback' else 'Direct',
                                   scopes=[self.scope(station,None,None,site,None,None)],semantic='site_scope_only')
                if nonempty(pricing.get('directCpo')):
                    self.offer(pointer('sites',i,'pricing','directCpo'),pricing['directCpo'],
                               scopes=[self.scope(station,None,None,site,None,None)],semantic='site_scope_only')
        elif sid.startswith('uk-') or sid=='allego-uk-pcpr-direct':
            for si,source in enumerate(payload.get('sources',[])):
                refs=defaultdict(list)
                for li,loc in enumerate(source.get('locations',[])):
                    station=loc.get('id')
                    for ei,ev in enumerate(loc.get('evses',[])):
                        evse=ev.get('evse_id') or ev.get('uid') or ev.get('id')
                        for ci,con in enumerate(ev.get('connectors',[])):
                            connector=con.get('id')
                            scope=self.scope(station,evse,connector,loc,ev,con)
                            for tid in con.get('tariff_ids') or []:refs[str(tid)].append(scope)
                            for field in ('validatedV9Offer','tcc_direct_price'):
                                if isinstance(con.get(field),dict):
                                    self.offer(pointer('sources',si,'locations',li,'evses',ei,'connectors',ci,field),
                                               con[field],offer_id=con[field].get('id'),scopes=[scope],semantic='connector_embedded_offer')
                            if con.get('tcc_direct_price_gbp_per_kwh') is not None:
                                self.offer(pointer('sources',si,'locations',li,'evses',ei,'connectors',ci,'tcc_direct_price_gbp_per_kwh'),
                                           con['tcc_direct_price_gbp_per_kwh'],scopes=[scope],semantic='connector_derived_rate')
                for ti,tariff in enumerate(source.get('tariffs',[])):
                    self.offer(pointer('sources',si,'tariffs',ti),tariff,offer_id=tariff.get('id'),
                               scopes=refs.get(str(tariff.get('id')),()),
                               semantic='ocpi_tariff_with_exact_references' if refs.get(str(tariff.get('id'))) else 'ocpi_tariff_unreferenced')
        elif sid=='france-ionity-r8':
            for i,station in enumerate(payload.get('stations',[])):
                station_id=station.get('locationUuid')
                for j,con in enumerate(station.get('connectors',[])):
                    if nonempty(con.get('adhocPrice')):
                        self.offer(pointer('stations',i,'connectors',j,'adhocPrice'),con['adhocPrice'],
                                   scopes=[self.scope(station_id,con.get('evseId') or con.get('sourceEvseId'),
                                                      con.get('uuid') or con.get('id'),station,con,con)])
        elif sid=='italy-ionity-r8':
            for i,match in enumerate(payload.get('matches',[])):
                station=match.get('ionityLocationUuid')
                for bucket in ('resolvedEvses','apiOnlyConnectors'):
                    for j,con in enumerate(match.get(bucket,[])):
                        if con.get('pricePerKwhEur') is not None:
                            self.offer(pointer('matches',i,bucket,j),con,
                                       scopes=[self.scope(station,con.get('evseId'),con.get('connectorUuid'),match,con,con)])
            for i,loc in enumerate(payload.get('apiOnlyLocations',[])):
                for j,con in enumerate(loc.get('connectors',[])):
                    if con.get('pricePerKwhEur') is not None:
                        self.offer(pointer('apiOnlyLocations',i,'connectors',j),con,
                                   scopes=[self.scope(loc.get('locationUuid'),con.get('evseId'),con.get('uuid'),loc,con,con)])
        elif sid=='switzerland-avia-r8':
            for i,con in enumerate(payload.get('connectors',[])):
                if nonempty(con.get('price')):
                    self.offer(pointer('connectors',i,'price'),con['price'],
                               scopes=[self.scope(con.get('locationUuid') or con.get('locationId'),con.get('evseId'),
                                                  con.get('connectorInternalId'),con,con,con)])
        elif sid=='netherlands-dotnl-national':
            for i,row in enumerate(payload):
                if not isinstance(row,list) or len(row)<9:continue
                for j,con in enumerate(row[8] if isinstance(row[8],list) else []):
                    if isinstance(con,list) and len(con)>5 and nonempty(con[5]):
                        self.offer(pointer(i,8,j,5),con[5],
                                   scopes=[self.scope(row[0],con[0],None,row,con,None)],semantic='compact_rules_exact_evse')
        elif sid=='belgium-nap-national':
            locations=payload.get('locations',[]) if isinstance(payload,dict) else payload
            for li,loc in enumerate(locations):
                for sti,st in enumerate(loc.get('stations',[])):
                    for ei,ev in enumerate(st.get('evses',[])):
                        for pi,price in enumerate(ev.get('prices') or []):
                            self.offer(pointer('locations',li,'stations',sti,'evses',ei,'prices',pi),price,
                                       offer_id=price.get('rateId'),cpo=loc.get('operator'),
                                       scopes=[self.scope(loc.get('id'),ev.get('id'),None,loc,ev,None)])
        elif sid=='energyvision-be-official':
            for si,site in enumerate(payload.get('sites',[])):
                for ti,station in enumerate(site.get('stations',[])):
                    for ri,rate in enumerate(station.get('sourceStationRatesUnassignedToPdc',[])):
                        self.offer(pointer('sites',si,'stations',ti,'sourceStationRatesUnassignedToPdc',ri),rate,
                                   offer_id=rate.get('sourceRateId'),scopes=[self.scope(station.get('sourceStationId'),None,None,station,None,None)],
                                   semantic='station_rate_pdc_unverified')

    def run(self, source_registry):
        missing_ids={row['sourceId'] for row in read(pathlib.Path(__file__).resolve().parents[1]/'reports/v9-tariff-133/coverage-pin-2026-10-15.json')['missingData']}
        for source in source_registry['sources']:
            sid=source['id']
            if sid not in missing_ids:continue
            if sid=='tesla-global':
                self.status[sid]={'status':'already_enumerated_phase1','rawOffersAdded':0,'rawOffersAlreadyEnumerated':1179}
                continue
            if sid=='user-stations':
                self.status[sid]={'status':'not_pinned_runtime_user_data','rawOffersAdded':0,'sourceCandidateOffers':None}
                continue
            paths=source_paths(self.root,source)
            if not paths:
                self.status[sid]={'status':'source_file_missing_from_dist','rawOffersAdded':0,'sourceCandidateOffers':None}
                continue
            count_before=self.counts[sid]['rawOffersAdded']
            for path in paths:
                self.file(source,path)
                payload=read(path)
                self.payload=payload
                self.extract(payload)
            added=self.counts[sid]['rawOffersAdded']-count_before
            self.status[sid]={'status':'extracted' if added else 'no_tariff_payload_in_pinned_source',
                              'rawOffersAdded':added,'sourceCandidateOffers':added,
                              'paths':[str(p.relative_to(self.root)) for p in paths],
                              'diagnostics':dict(self.counts[sid])}
        self.db.commit()
        after=self.db.execute('SELECT COUNT(*) FROM RawOffer').fetchone()[0]
        after_evidence=self.db.execute('SELECT COUNT(*) FROM Evidence').fetchone()[0]
        assert after-self.before==sum(x['rawOffersAdded'] for x in self.status.values())
        report={'snapshotId':PIN,'rawOffersBefore':self.before,'rawOffersAfter':after,'rawOffersAdded':after-self.before,
                'sourceFilesInspected':self.file_count,'evidenceRecordsAdded':after_evidence-self.before_evidence,
                'scopeAssertionsAdded':self.scope_count,
                'sources':self.status}
        self.db.close()
        return report

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('dist',type=pathlib.Path)
    ap.add_argument('--database',type=pathlib.Path,required=True,help='Writable copy of the #136 database')
    ap.add_argument('--report',type=pathlib.Path,required=True)
    args=ap.parse_args()
    assert read(args.dist/'manifest.json')['snapshotId']==PIN
    assert args.database.is_file()
    importer=Importer(args.dist.resolve(),args.database)
    report=importer.run(read(args.dist/'runtime/data/v9/source-registry.json'))
    args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'before':report['rawOffersBefore'],'after':report['rawOffersAfter'],
                      'added':report['rawOffersAdded'],'statuses':dict(Counter(v['status'] for v in report['sources'].values()))}))

if __name__=='__main__':main()
