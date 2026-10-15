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
            raw_key,path,sha,_ = raw[0]
            scopes = db.execute('SELECT scope_kind,source_id,link_status,point_key,connector_key FROM OfferScope WHERE raw_key=?',(raw_key,)).fetchall()
            exact = []
            for kind,source_id,status,point_key,connector_key in scopes:
                if status!='exact_unique':continue
                point = point_key or db.execute('SELECT point_key FROM Connector WHERE connector_key=?',(connector_key,)).fetchone()
                point = point[0] if isinstance(point,tuple) else point
                if not point:continue
                found=db.execute('''SELECT s.source_id,p.source_evse_id,p.pdc_id
                    FROM ChargePoint p JOIN SourceStation s ON s.station_key=p.station_key
                    WHERE p.point_key=?''',(point,)).fetchone()
                if not found:continue
                station_id,evse_id,pdc_id=found
                if station_id==source_station and (str(evse_id)==str(row.get('evseId')) or str(pdc_id)==str(row.get('evseId'))
                    or (connector_key and str(db.execute('SELECT source_connector_id FROM Connector WHERE connector_key=?',(connector_key,)).fetchone()[0])==str(row.get('connectorId')))):
                    exact.append({'scopeKind':kind,'sourceId':source_id})
            proof = {'state':'exact_catalogue_link' if exact else 'raw_offer_without_proven_runtime_scope',
                     'rawKey':raw_key,'sourcePath':path,'sourceSha256':sha,'exactAssertions':exact,
                     'scopeStatuses':dict(Counter(s[2] for s in scopes))}
    row['catalogueProof'] = proof
    states[proof['state']] += 1
    by_lane[(row['country'],str(row.get('channel') or 'Unspecified'))][proof['state']] += 1
report['summary']['catalogueProof'] = dict(states)
report['summary']['catalogueProofByCountryChannel'] = [
    {'country':cc,'channel':channel,'states':dict(counts)}
    for (cc,channel),counts in sorted(by_lane.items())]
args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report['summary']['catalogueProof']))
