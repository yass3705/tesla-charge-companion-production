#!/usr/bin/env python3
"""Compare the pinned #136 catalogue with its additive embedded-offer copy."""
import argparse
import csv
import gzip
import json
import sqlite3
from collections import Counter
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('before', type=Path)
parser.add_argument('after', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()

def view(path):
    db = sqlite3.connect(f'file:{path}?mode=ro', uri=True)
    db.row_factory = sqlite3.Row
    tables = {'sites': 'Site', 'sourceStations': 'SourceStation', 'chargePoints': 'ChargePoint',
              'connectors': 'Connector', 'rawOffers': 'RawOffer', 'scopeAssertions': 'OfferScope',
              'evidence': 'Evidence', 'scenarios': 'Scenario'}
    totals = {name: db.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0] for name, table in tables.items()}
    def rows(query):
        return [dict(row) for row in db.execute(query)]
    return {'totals': totals,
        'byCountryCpoChannel': rows('''SELECT country,cpo,channel,COUNT(*) rawOffers,
            COUNT(DISTINCT source_path) sourceFiles FROM RawOffer GROUP BY country,cpo,channel
            ORDER BY country,cpo,channel'''),
        'byCountryCpoInventory': rows('''SELECT s.country,s.cpo,
            COUNT(DISTINCT s.station_key) sourceStations,COUNT(DISTINCT p.point_key) chargePoints,
            COUNT(DISTINCT c.connector_key) connectors
            FROM SourceStation s LEFT JOIN ChargePoint p ON p.station_key=s.station_key
            LEFT JOIN Connector c ON c.point_key=p.point_key
            GROUP BY s.country,s.cpo ORDER BY s.country,s.cpo'''),
        'byCountryCpoChannelScope': rows('''SELECT r.country,r.cpo,r.channel,s.scope_kind,s.link_status,
            COUNT(*) assertions,COUNT(DISTINCT r.raw_key) offers
            FROM RawOffer r JOIN OfferScope s ON s.raw_key=r.raw_key
            GROUP BY r.country,r.cpo,r.channel,s.scope_kind,s.link_status
            ORDER BY r.country,r.cpo,r.channel,s.scope_kind,s.link_status''')}

before, after = view(args.before), view(args.after)
delta = {key: after['totals'][key]-value for key,value in before['totals'].items()}
assert delta['rawOffers'] >= 0 and delta['sourceStations'] >= 0
report = {'schemaVersion':1,'snapshotId':'2026-10-15-v9-tesla-mac-ingress-verified',
          'countingRule':'RawOffer is a source JSON leaf at an exact file SHA and JSON pointer; OfferScope assertions count separately and a station-only scope never implies a point or connector price.',
          'before':before,'after':after,'delta':delta}
args.output.parent.mkdir(parents=True,exist_ok=True)
args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
detail = args.output.with_name(args.output.stem+'-station-point-connector.csv.gz')
offers_detail = args.output.with_name(args.output.stem+'-offer-scope.csv.gz')
db = sqlite3.connect(f'file:{args.after}?mode=ro',uri=True)
with gzip.open(detail,'wt',encoding='utf-8',newline='') as stream:
    writer=csv.writer(stream)
    writer.writerow(['country','cpo','sourceStationId','evseId','pdcId','connectorId','stationKey','pointKey','connectorKey'])
    for row in db.execute('''SELECT s.country,s.cpo,s.source_id,p.source_evse_id,p.pdc_id,
            c.source_connector_id,s.station_key,p.point_key,c.connector_key
            FROM SourceStation s LEFT JOIN ChargePoint p ON p.station_key=s.station_key
            LEFT JOIN Connector c ON c.point_key=p.point_key
            ORDER BY s.country,s.cpo,s.source_id,p.source_evse_id,c.source_connector_id'''):
        writer.writerow(row)
with gzip.open(offers_detail,'wt',encoding='utf-8',newline='') as stream:
    writer=csv.writer(stream)
    writer.writerow(['country','cpo','channel','offerId','rawKey','sourcePath','sourceSha256',
                     'scopeKind','scopeSourceId','pointKey','connectorKey','linkStatus'])
    for row in db.execute('''SELECT r.country,r.cpo,r.channel,r.offer_id,r.raw_key,r.source_path,
        r.source_sha256,s.scope_kind,s.source_id,s.point_key,s.connector_key,s.link_status
        FROM RawOffer r LEFT JOIN OfferScope s ON s.raw_key=r.raw_key
        ORDER BY r.country,r.cpo,r.channel,r.raw_key'''):
        writer.writerow(row)
report['detailFiles'] = [detail.name,offers_detail.name]
args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(delta))
