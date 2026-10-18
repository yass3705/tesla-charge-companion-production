#!/usr/bin/env python3
"""Reconcile each dual-run offer with its immutable raw record and exact scope."""
import argparse
import json
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('database', type=Path)
parser.add_argument('dualrun', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
db = sqlite3.connect(f'file:{args.database}?mode=ro', uri=True)
report = json.loads(args.dualrun.read_text())
wanted = sorted({r['offerId'] for r in report['rows'] if r.get('offerId')})
raw_by_id = defaultdict(list)
if wanted:
    placeholders = ','.join('?' for _ in wanted)
    for offer_id,country,raw_key,path,sha,payload in db.execute(
        f'SELECT offer_id,country,raw_key,source_path,source_sha256,raw_json FROM RawOffer WHERE offer_id IN ({placeholders})',wanted):
        raw_by_id[(offer_id,country)].append((raw_key,path,sha,payload))
states = Counter()
by_lane = defaultdict(Counter)
for row in report['rows']:
    offer_id = row.get('offerId')
    if not offer_id:
        proof = {'state': 'no_exact_runtime_offer'}
    else:
        raw = raw_by_id[(offer_id,row['country'])]
        oracle = (row.get('new') or {}).get('oracle') or {}
        derived_kind = ('kilowatt_connector' if str(offer_id).startswith('kilowatt-native:') else
                        'dotnl_active_compact' if str(offer_id).startswith('netherlands-dotnl-national:') else
                        'uk_ocpi_tariff' if str(offer_id).startswith('uk-production-open-feeds:') else
                        'belgium_nap_price' if str(offer_id).startswith('belgium-nap-national:') else None)
        derived_key = oracle.get('rawKey') if derived_kind else None
        if not raw and derived_key:
            raw = db.execute('SELECT raw_key,source_path,source_sha256,raw_json FROM RawOffer WHERE raw_key=?',
                             (derived_key,)).fetchall()
        runtime_station = str(row.get('stationId') or '')
        national_prefix = row['country'] + ':national:'
        source_station = runtime_station[len(national_prefix):] if runtime_station.startswith(national_prefix) else runtime_station
        if len(raw)>1:
            raw = [r for r in raw if json.loads(r[3]).get('sourceStationId') == source_station
                   or json.loads(r[3]).get('sourceStationId') == row.get('stationId')]
        if not raw:
            proof = {'state': 'raw_offer_not_enumerated', 'reason': 'embedded_adapter_or_runtime_derived_offer'}
        elif len(raw)>1:
            proof = {'state': 'ambiguous_raw_offer_id', 'matches': len(raw)}
        else:
            raw_key,path,sha,payload = raw[0]
            raw_offer=json.loads(payload)
            scopes = db.execute('SELECT scope_kind,source_id,link_status,point_key,connector_key FROM OfferScope WHERE raw_key=?',(raw_key,)).fetchall()
            exact = []
            for kind,source_id,status,point_key,connector_key in scopes:
                if status not in ('exact_unique','source_exact_join'):continue
                point = point_key or db.execute('SELECT point_key FROM Connector WHERE connector_key=?',(connector_key,)).fetchone()
                point = point[0] if isinstance(point,tuple) else point
                if not point:continue
                found=db.execute('''SELECT s.source_id,p.source_evse_id,p.pdc_id
                    FROM ChargePoint p JOIN SourceStation s ON s.station_key=p.station_key
                    WHERE p.point_key=?''',(point,)).fetchone()
                if not found:continue
                station_id,evse_id,pdc_id=found
                station_proven=(station_id==source_station or runtime_station.endswith(':'+str(station_id))) and (
                    not isinstance(raw_offer,dict) or not raw_offer.get('stationIds') or station_id in raw_offer['stationIds'])
                source_connector = db.execute('SELECT source_connector_id FROM Connector WHERE connector_key=?',
                                              (connector_key,)).fetchone() if connector_key else None
                derived_match = bool(derived_kind=='kilowatt_connector' and connector_key and source_connector and
                    str(row.get('connectorId')) == 'kilowatt-native:'+str(source_connector[0]) and
                    str(row.get('evseId')) == 'kilowatt-native:'+str(evse_id) and
                    str(raw_offer.get('id')) == str(source_connector[0]) and
                    str(raw_offer.get('chargestation_id')) == str(evse_id))
                if station_proven and (str(evse_id)==str(row.get('evseId')) or str(pdc_id)==str(row.get('evseId'))
                    or (source_connector and str(source_connector[0])==str(row.get('connectorId'))) or derived_match):
                    exact.append({'scopeKind':kind,'sourceId':source_id})
            proof = {'state':('exact_derived_catalogue_link' if derived_key else 'exact_catalogue_link') if exact
                     else 'raw_offer_without_proven_runtime_scope',
                     'rawKey':raw_key,'sourcePath':path,'sourceSha256':sha,'exactAssertions':exact,
                     'scopeStatuses':dict(Counter(s[2] for s in scopes)),
                     'derivation':{'kilowatt_connector':'connector_id_and_charge_point_id_from_pinned_kilowatt_native',
                                   'dotnl_active_compact':'point_id_and_rules_from_pinned_active_dotnl',
                                   'uk_ocpi_tariff':'ocpi_location_evse_connector_tariff_reference',
                                   'belgium_nap_price':'nap_location_evse_ad_hoc_rate_reference'}.get(derived_kind)}
            equivalent_keys = oracle.get('equivalentRawKeys') or []
            if equivalent_keys and proof['state']=='exact_derived_catalogue_link':
                alternatives = db.execute('SELECT raw_key,source_path,source_sha256,raw_json FROM RawOffer WHERE raw_key IN ('+
                                          ','.join('?' for _ in equivalent_keys)+')', equivalent_keys).fetchall()
                alternate_scopes_ok = all(any(
                    status in ('exact_unique','source_exact_join') and
                    json.loads(source_id).get('stationId') == source_station and
                    json.loads(source_id).get('evseId') == row.get('evseId') and
                    (point_key or connector_key)
                    for source_id,status,point_key,connector_key in db.execute(
                        'SELECT source_id,link_status,point_key,connector_key FROM OfferScope WHERE raw_key=?',
                        (key,))) for key in equivalent_keys)
                if len(alternatives)==len(equivalent_keys) and len({item[3] for item in alternatives})==1 and alternate_scopes_ok:
                    proof['equivalentRawOffers']=[{'rawKey':key,'sourcePath':path,'sourceSha256':sha}
                                                  for key,path,sha,_ in sorted(alternatives)]
                else:
                    proof['state']='ambiguous_duplicate_source_payload'
    row['catalogueProof'] = proof
    oracle = (row.get('new') or {}).get('oracle') or {}
    differences = (row.get('legacy') or {}).get('differences') or []
    if (row.get('new') or {}).get('status') == 'ineligible' and (row.get('new') or {}).get('reason') == 'subscription_not_selected':
        row['classification'] = 'ineligible_expected'
    elif differences:
        exact = proof['state'] in ('exact_catalogue_link','exact_derived_catalogue_link') and oracle.get('status') == 'priced'
        new = row.get('new') or {}
        old = row.get('legacy') or {}
        oracle_total = oracle.get('total')
        candidate_correct = exact and new.get('status') == 'priced' and isinstance(oracle_total,(int,float)) and abs(new.get('total',float('inf'))-oracle_total)<1e-5
        old_correct = exact and old.get('oldStatus') == 'priced' and isinstance(old.get('oldTotal'),(int,float)) and abs(old['oldTotal']-oracle_total)<1e-5
        row['classification'] = 'correction_demonstrated' if candidate_correct and not old_correct else ('regression' if old_correct and not candidate_correct else 'data_insufficient')
    elif row.get('classification') not in ('match','not_compared'):
        row['classification'] = 'data_insufficient'
    states[proof['state']] += 1
    by_lane[(row['country'],str(row.get('channel') or 'Unspecified'))][proof['state']] += 1
report['summary']['catalogueProof'] = dict(states)
report['summary']['catalogueProofByCountryChannel'] = [
    {'country':cc,'channel':channel,'states':dict(counts)}
    for (cc,channel),counts in sorted(by_lane.items())]
report['summary']['byClassification'] = dict(Counter(row.get('classification','not_compared') for row in report['rows']))
scenario = defaultdict(lambda: {'rows':0,'statuses':Counter(),'classifications':Counter(),
                                 'proofStates':Counter(),'oracleStatuses':Counter(),'differenceFields':Counter()})
for row in report['rows']:
    bucket=scenario[row['key']]
    bucket['rows']+=1
    bucket['statuses'][(row.get('new') or {}).get('status') or row.get('status','unknown')]+=1
    bucket['classifications'][row.get('classification','not_compared')]+=1
    bucket['proofStates'][row['catalogueProof']['state']]+=1
    bucket['oracleStatuses'][((row.get('new') or {}).get('oracle') or {}).get('status','not_run')]+=1
    bucket['differenceFields'].update((row.get('legacy') or {}).get('differences') or [])
report['summary']['byScenario'] = [{'scenario':key,**{k:dict(v) if isinstance(v,Counter) else v for k,v in value.items()}}
                                  for key,value in sorted(scenario.items())]
args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report['summary']['catalogueProof']))
