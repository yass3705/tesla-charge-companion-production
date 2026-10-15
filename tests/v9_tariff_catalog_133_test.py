#!/usr/bin/env python3
"""Assertions on an independently rebuilt pinned catalogue database."""
import json
import os
import sqlite3
from pathlib import Path

database = Path(os.environ['TCC_V9_CATALOG_DB'])
report = json.loads(Path(os.environ['TCC_V9_COVERAGE_REPORT']).read_text())
db = sqlite3.connect(f'file:{database}?mode=ro', uri=True)
count = lambda table: db.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0]
assert report['snapshotId'] == '2026-10-15-v9-tesla-mac-ingress-verified'
assert count('RawOffer') == report['catalogue']['rawOffersBefore'] == report['catalogue']['rawOffersAfter']
assert count('Scenario') == 13
assert db.execute('SELECT COUNT(*) FROM RawOffer WHERE source_path="runtime/data/tesla_stations.json"').fetchone()[0] > 0
site = 'FR:electra:0a650b39-b871-4e78-9670-e56e6b20f329'
station_ids = {r[0] for r in db.execute('SELECT source_id FROM SourceStation WHERE site_key=?',(site,))}
assert station_ids == {'FRELCP12954082','FRELCP5265355','FRELCPBDALE'}
assert db.execute('''SELECT COUNT(*) FROM ChargePoint WHERE station_key IN
    (SELECT station_key FROM SourceStation WHERE site_key=?)''',(site,)).fetchone()[0] == 28
assert db.execute('SELECT COUNT(*) FROM OfferScope WHERE scope_kind="Site"').fetchone()[0] == 0
assert db.execute('SELECT COUNT(*) FROM OfferScope WHERE link_status="ambiguous_exact_id"').fetchone()[0] > 0
assert report['catalogue']['rawOfferLoss'] == 0
assert report['missingData'], 'opaque adapter sources must be visible'
dual = json.loads((Path(__file__).resolve().parents[1]/'reports/v9-tariff-133/dualrun-pin-2026-10-15.json').read_text())
assert dual['summary']['catalogueProof'] == {'exact_catalogue_link':29,'no_exact_runtime_offer':1,
                                             'raw_offer_not_enumerated':14}
for row in dual['rows']:
    proof=row['catalogueProof']
    if proof['state']=='exact_catalogue_link':
        assert db.execute('SELECT source_sha256 FROM RawOffer WHERE raw_key=?',(proof['rawKey'],)).fetchone()[0] == proof['sourceSha256']
print('V9 pinned catalogue #133 invariants OK')
