#!/usr/bin/env python3
"""Compare the same pinned Phase 4/5 tuples without merging proof populations."""
import argparse
import hashlib
import json
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('before', type=Path)
p.add_argument('after', type=Path)
p.add_argument('catalogue', type=Path)
p.add_argument('dist', type=Path)
p.add_argument('output', type=Path)
args = p.parse_args()
before = json.loads(args.before.read_text())
after = json.loads(args.after.read_text())
manifest_bytes = (args.dist / 'manifest.json').read_bytes()
manifest = json.loads(manifest_bytes)
assert before['summary']['snapshotId'] == after['summary']['snapshotId'] == manifest['snapshotId']
db = sqlite3.connect(f'file:{args.catalogue}?mode=ro', uri=True)

def key(row):
    return tuple(row.get(field) for field in ('key', 'stationId', 'evseId', 'connectorId', 'offerId'))

old = {key(x): x for x in before['rows']}
new = {key(x): x for x in after['rows']}
assert len(old) == len(new) == 721 and old.keys() == new.keys()
assert before['summary']['sampling'] == after['summary']['sampling']
runtime_fields = ('status', 'total', 'currency', 'targetTotal', 'fxStatus', 'components',
                  'componentValues', 'source', 'reason')
legacy_fields = ('oldStatus', 'oldTotal', 'oldCurrency', 'differences')
runtime_differences = []
for identity, old_row in old.items():
    row = new[identity]
    if any((old_row.get('new') or {}).get(field) != (row.get('new') or {}).get(field)
           for field in runtime_fields) or any((old_row.get('legacy') or {}).get(field) !=
                                            (row.get('legacy') or {}).get(field) for field in legacy_fields):
        runtime_differences.append(identity)
assert not runtime_differences

def status(row):
    return (row.get('new') or {}).get('status') or row.get('status')

def oracle_status(row):
    return ((row.get('new') or {}).get('oracle') or {}).get('status', 'not_run')

def no_oracle(row):
    return status(row) == 'priced' and oracle_status(row) != 'priced'

def row_id(row):
    return dict(zip(('scenario', 'stationId', 'evseId', 'connectorId', 'offerId'), key(row)))

lineage = []
oracle = []
for identity, old_row in old.items():
    row = new[identity]
    old_proof = old_row['catalogueProof']['state']
    new_proof = row['catalogueProof']
    if old_proof == 'raw_offer_not_enumerated':
        country = row['country']
        duplicate = len(new_proof.get('equivalentRawOffers') or []) > 1
        root = ('oracle_status_suppressed_exact_pointer' if country == 'NL' else
                'single_nap_page_lookup_and_duplicate_exact_rows' if duplicate else
                'single_nap_page_lookup' if country == 'BE' else
                'uk_lookup_restricted_to_applegreen')
        lineage.append({**row_id(row), 'country': country, 'cpo': row.get('cpo'),
                        'channel': row.get('channel'), 'tariffFamily': row.get('tariffFamily'),
                        'rootCause': root, 'before': old_proof, 'after': new_proof['state'],
                        'rawKey': new_proof.get('rawKey'), 'sourcePath': new_proof.get('sourcePath'),
                        'sourceSha256': new_proof.get('sourceSha256'),
                        'equivalentRawOffers': new_proof.get('equivalentRawOffers', []),
                        'exactAssertions': new_proof.get('exactAssertions', [])})
    if no_oracle(old_row):
        candidate = row.get('new') or {}
        source_oracle = candidate.get('oracle') or {}
        oracle.append({**row_id(row), 'country': row['country'], 'cpo': row.get('cpo'),
                       'channel': row.get('channel'), 'tariffFamily': row.get('tariffFamily'),
                       'beforeReason': (old_row.get('new') or {}).get('oracle', {}).get('reason'),
                       'afterOracle': source_oracle.get('status'), 'afterReason': source_oracle.get('reason'),
                       'sourcePath': row['catalogueProof'].get('sourcePath'),
                       'sourceSha256': row['catalogueProof'].get('sourceSha256'),
                       'rawKey': row['catalogueProof'].get('rawKey'),
                       'candidateTotal': candidate.get('total'), 'oracleTotal': source_oracle.get('total'),
                       'currency': candidate.get('currency'),
                       'amountMatches': source_oracle.get('status') == 'priced' and
                           abs(candidate.get('total', float('inf')) - source_oracle.get('total', float('-inf'))) <= 1e-5})

assert len(lineage) == 151 and len(oracle) == 230
assert all(x['after'] in ('exact_catalogue_link', 'exact_derived_catalogue_link') for x in lineage)
evidence_paths = {(x['sourcePath'], x['sourceSha256']) for x in lineage}
for path, sha in evidence_paths:
    assert db.execute('SELECT COUNT(*) FROM Evidence WHERE source_path=? AND source_sha256=?',
                      (path, sha)).fetchone()[0] >= 1
overlap = sum(1 for identity, row in old.items()
              if row['catalogueProof']['state'] == 'raw_offer_not_enumerated' and no_oracle(row))
assert overlap == 38
catalogue = {table: db.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0]
             for table in ('RawOffer', 'SourceStation', 'ChargePoint', 'Connector', 'OfferScope')}
assert catalogue['RawOffer'] == 666631
assert db.execute('SELECT COUNT(*) FROM OfferScope WHERE raw_key NOT IN (SELECT raw_key FROM RawOffer)').fetchone()[0] == 0

def counts(rows, getter):
    return dict(sorted(Counter(getter(row) for row in rows).items(), key=lambda pair: str(pair[0])))

def by_country(rows, field):
    groups = defaultdict(Counter)
    for row in rows:
        groups[row['country']][row[field]] += 1
    return {country: dict(counter) for country, counter in sorted(groups.items())}

original_no_oracle = {identity for identity, row in old.items() if no_oracle(row)}
after_no_oracle = {identity for identity, row in new.items() if no_oracle(row)}
newly_proven = original_no_oracle - after_no_oracle
newly_unproven = after_no_oracle - original_no_oracle
priced_oracle_mismatches = [row_id(row) for row in new.values()
                            if status(row) == 'priced' and oracle_status(row) == 'priced' and
                            abs(row['new']['total'] - row['new']['oracle']['total']) > 1e-5]
report = {
    'snapshotId': manifest['snapshotId'],
    'manifestSha256': hashlib.sha256(manifest_bytes).hexdigest(),
    'manifestFiles': manifest['fileCount'],
    'catalogue': catalogue,
    'evidence': {'records': db.execute('SELECT COUNT(*) FROM Evidence').fetchone()[0],
                 'phase5LineageDistinctPathsWithExactSha': len(evidence_paths)},
    'sample': {'scenarios': len(after['summary']['sampling']['scenarios']),
               'exactTuplesInQueriesWithRepeatedSessions': after['summary']['sampling']['exactTuplesInAreas'],
               'selectedExactTuples': after['summary']['sampling']['sampled'], 'rows': len(new)},
    'runtimeParity': {'rows': len(new), 'changedStatusAmountCurrencyComponentsFxSourceScope': runtime_differences},
    'intersection': {'originalLineageGapAndOracleGap': overlap,
                     'originalUnion': len(lineage) + len(oracle) - overlap},
    'before': {'status': counts(old.values(), status),
               'classification': counts(old.values(), lambda row: row.get('classification')),
               'catalogueProof': counts(old.values(), lambda row: row['catalogueProof']['state']),
               'pricedWithoutOracle': len(original_no_oracle)},
    'after': {'status': counts(new.values(), status),
              'classification': counts(new.values(), lambda row: row.get('classification')),
              'catalogueProof': counts(new.values(), lambda row: row['catalogueProof']['state']),
              'pricedWithoutOracle': len(after_no_oracle),
              'pricedWithOracle': sum(status(row) == 'priced' and oracle_status(row) == 'priced' for row in new.values()),
              'pricedOracleMismatches': priced_oracle_mismatches},
    'oracleTransition': {'newlyProvenFromOriginal230': len(newly_proven),
                         'remainingFromOriginal230': len(original_no_oracle & after_no_oracle),
                         'previouslyProvenNowRefused': len(newly_unproven),
                         'newlyProvenByCountry': counts((new[identity] for identity in newly_proven),
                                                        lambda row: row['country']),
                         'remainingByCountryAndReason': counts((new[identity] for identity in after_no_oracle),
                            lambda row: row['country'] + ':' + str(row['new']['oracle'].get('reason')))},
    'lineage151': lineage,
    'oracle230': oracle,
    'lineageByCountryAndRoot': counts(lineage, lambda x: x['country'] + ':' + x['rootCause']),
    'oracleByCountryAndBeforeReason': counts(oracle, lambda x: x['country'] + ':' + str(x['beforeReason'])),
    'phase4Discrepancies18': [
        {**row_id(new[identity]), 'before': row.get('classification'),
         'after': new[identity].get('classification'), 'candidateStatus': status(new[identity]),
         'oracle': oracle_status(new[identity]), 'reason': (new[identity].get('new') or {}).get('oracle', {}).get('reason')}
        for identity, row in old.items() if row.get('classification') == 'data_insufficient'
    ],
}
assert len(report['phase4Discrepancies18']) == 18
assert not priced_oracle_mismatches
args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'lineage': len(lineage), 'oracle': len(oracle), 'overlap': overlap,
                  'after': report['after'], 'transition': report['oracleTransition']}))
