#!/usr/bin/env python3
"""Summarise the bounded Phase 4 dual-run and immutable catalogue, read only."""
import argparse
import hashlib
import json
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('catalogue', type=Path)
parser.add_argument('dualrun', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
db = sqlite3.connect(f'file:{args.catalogue}?mode=ro', uri=True)
run_bytes = args.dualrun.read_bytes()
run = json.loads(run_bytes)
rows = run['rows']
assert run['summary']['snapshotId'] == '2026-10-15-v9-tesla-mac-ingress-verified'
assert len(rows) == run['summary']['scenarioCount']
assert len(rows) == run['summary']['sampling']['sampled'] + 2

catalogue = {table: db.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0]
             for table in ('RawOffer', 'SourceStation', 'ChargePoint', 'Connector', 'OfferScope')}
assert catalogue['RawOffer'] == 666631
assert db.execute('SELECT COUNT(DISTINCT raw_key) FROM RawOffer').fetchone()[0] == 666631
assert db.execute('SELECT COUNT(*) FROM RawOffer WHERE raw_json IS NULL OR source_path IS NULL OR source_sha256 IS NULL').fetchone()[0] == 0
assert db.execute('SELECT COUNT(*) FROM OfferScope WHERE raw_key NOT IN (SELECT raw_key FROM RawOffer)').fetchone()[0] == 0

def power_band(power):
    p = float(power or 0)
    return 'AC/low' if p < 25 else 'DC/mid' if p < 150 else 'DC/high'

dimensions = ('country', 'cpo', 'channel', 'powerBand', 'tariffFamily')
groups = defaultdict(lambda: {'rows': 0, 'states': Counter(), 'classifications': Counter(),
                               'catalogueProof': Counter(), 'oracle': Counter()})
for row in rows:
    key = (row.get('country'), row.get('cpo'), row.get('channel'),
           power_band(row.get('powerKw')) if row.get('offerId') else None,
           row.get('tariffFamily'))
    g = groups[key]
    g['rows'] += 1
    g['states'][(row.get('new') or {}).get('status') or row.get('status')] += 1
    g['classifications'][row.get('classification')] += 1
    g['catalogueProof'][(row.get('catalogueProof') or {}).get('state')] += 1
    g['oracle'][((row.get('new') or {}).get('oracle') or {}).get('status', 'not_run')] += 1

summary = {'status': dict(Counter((r.get('new') or {}).get('status') or r.get('status') for r in rows)),
           'classification': dict(Counter(r.get('classification') for r in rows)),
           'catalogueProof': dict(Counter(r['catalogueProof']['state'] for r in rows)),
           'oracle': dict(Counter(((r.get('new') or {}).get('oracle') or {}).get('status', 'not_run') for r in rows))}
output = {
    'snapshotId': run['summary']['snapshotId'],
    'dualrunSha256': hashlib.sha256(run_bytes).hexdigest(),
    'sampling': run['summary']['sampling'],
    'population': 'Only exact runtime tuples in the 21 configured geographic/scenario queries; repeated sessions count separately. Not a catalogue sample rate.',
    'catalogue': catalogue,
    'rows': len(rows),
    'summary': summary,
    'byCountryCpoChannelPowerFamily': [
        {**dict(zip(dimensions, key)), **{name: dict(value) if isinstance(value, Counter) else value
                                        for name, value in bucket.items()}}
        for key, bucket in sorted(groups.items(), key=lambda item: tuple(str(x) for x in item[0]))
    ],
    'stopGates': {
        'sourceRowsWithoutCatalogueProof': summary['catalogueProof'].get('raw_offer_not_enumerated', 0),
        'pricedWithoutIndependentOracle': sum(1 for r in rows if (r.get('new') or {}).get('status') == 'priced'
                                               and ((r.get('new') or {}).get('oracle') or {}).get('status') != 'priced'),
        'dataInsufficient': summary['classification'].get('data_insufficient', 0),
        'regressions': summary['classification'].get('regression', 0),
        'noExactOffer': summary['status'].get('no_exact_offer', 0),
    },
}
assert sum(g['rows'] for g in output['byCountryCpoChannelPowerFamily']) == len(rows)
args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'rows': len(rows), 'groups': len(groups), 'summary': summary, 'catalogue': catalogue}))
