#!/usr/bin/env python3
"""Add exact station, PDC, connector and scope counts to a pinned catalogue report."""
import argparse
import json
import sqlite3
from collections import defaultdict
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('database', type=Path)
parser.add_argument('report', type=Path)
args = parser.parse_args()
db = sqlite3.connect(f'file:{args.database}?mode=ro', uri=True)
report = json.loads(args.report.read_text())
inventory = defaultdict(lambda: {'sourceStations': 0, 'chargePoints': 0, 'connectors': 0})
for country, cpo, stations, points, connectors in db.execute('''
    SELECT s.country,s.cpo,COUNT(DISTINCT s.station_key),COUNT(DISTINCT p.point_key),COUNT(c.connector_key)
    FROM SourceStation s LEFT JOIN ChargePoint p ON p.station_key=s.station_key
    LEFT JOIN Connector c ON c.point_key=p.point_key
    GROUP BY s.country,s.cpo ORDER BY s.country,s.cpo'''):
    inventory[(country,cpo)] = {'sourceStations': stations, 'chargePoints': points, 'connectors': connectors}
scopes = defaultdict(lambda: defaultdict(int))
for country,cpo,channel,status,count in db.execute('''
    SELECT r.country,r.cpo,r.channel,s.link_status,COUNT(*)
    FROM RawOffer r JOIN OfferScope s ON s.raw_key=r.raw_key
    GROUP BY r.country,r.cpo,r.channel,s.link_status'''):
    scopes[(country,cpo,channel)][status] = count
for item in report['byCountryCpoChannel']:
    item['scopeAssertions'] = dict(scopes[(item['country'],item['cpo'],item['channel'])])
report['byCountryCpoInventory'] = [dict(country=country,cpo=cpo,**counts)
                                    for (country,cpo),counts in inventory.items()]
report['catalogue']['sourceStations'] = db.execute('SELECT COUNT(*) FROM SourceStation').fetchone()[0]
report['catalogue']['chargePoints'] = db.execute('SELECT COUNT(*) FROM ChargePoint').fetchone()[0]
report['catalogue']['connectors'] = db.execute('SELECT COUNT(*) FROM Connector').fetchone()[0]
report['catalogue']['scopeAssertions'] = db.execute('SELECT COUNT(*) FROM OfferScope').fetchone()[0]
report['catalogue']['scenarios'] = db.execute('SELECT COUNT(*) FROM Scenario').fetchone()[0]
report['catalogue']['evidenceRecords'] = db.execute('SELECT COUNT(*) FROM Evidence').fetchone()[0]
args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report['catalogue']))
