#!/usr/bin/env python3
"""Fail-closed qualification of pinned Phase 5/6 tuples; no Production mutation."""
import argparse
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path

PIN = '2026-10-15-v9-tesla-mac-ingress-verified'
RESIDUAL = {'ES': 22, 'IT': 20, 'NL': 8, 'GB': 8, 'FR': 2, 'MA': 2}
KEYS = ('key', 'country', 'stationId', 'evseId', 'connectorId', 'offerId', 'cpo', 'channel', 'tariffFamily')
RUNTIME = ('status', 'total', 'currency', 'targetTotal', 'fxStatus', 'fxAsOf', 'components', 'componentValues', 'source', 'reason')

def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':'))

def row_id(row):
    return hashlib.sha256(canonical([row.get(k) for k in KEYS]).encode()).hexdigest()[:20]

def amount(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)

def component_values(result):
    out = defaultdict(float)
    for key, value in (result.get('componentValues') or {}).items():
        if amount(value):
            out['connectedTime' if key == 'connectedTimePerMinute' else 'flat' if key == 'connectionFee' else key] += value
        elif key in ('postCharge', 'connectedTimeAfterFree') and isinstance(value, dict):
            out['postChargeFee' if key == 'postCharge' else 'connectedTime'] += value.get('costEur', 0)
        elif key == 'parkingTime' and isinstance(value, dict):
            out['parkingTime'] += value.get('costGbp', value.get('costEur', 0))
        elif key == 'idleSupplement' and isinstance(value, dict):
            out['idleSupplement'] += value.get('costGbp', 0)
        elif key == 'componentGroups' and isinstance(value, list):
            for group in value:
                for part, cost in group.get('components', {}).items():
                    if amount(cost):
                        out['flat' if part == 'connectionFee' else part] += cost
                    else:
                        return None
        elif key == 'segmentedPricing' and isinstance(value, dict):
            for segment in value.get('segments', []):
                for part, cost in segment.get('components', {}).items():
                    if amount(cost):
                        out['flat' if part == 'connectionFee' else part] += cost
                    else:
                        return None
        elif key in ('guestPreAuthorisation', 'sourcePriceBasis'):
            # Metadata or non-billed authorization: billed components are elsewhere.
            continue
        else:
            return None
    return dict(out)

def check(row):
    new = row.get('new') or {}
    oracle = new.get('oracle') or {}
    proof = row.get('catalogueProof') or {}
    reasons = []
    if proof.get('state') not in ('exact_catalogue_link', 'exact_derived_catalogue_link') or not proof.get('rawKey') or not proof.get('sourceSha256') or not proof.get('exactAssertions'):
        reasons.append('no_exact_raw_offer_scope')
    if row.get('classification') in ('data_insufficient', 'regression'):
        reasons.append('unexplained_or_regression')
    if new.get('status') != 'priced' or oracle.get('status') != 'priced':
        reasons.append('amount_or_status_not_oracle_proved')
    else:
        if abs(new.get('total', float('inf')) - oracle.get('total', float('-inf'))) > 1e-5:
            reasons.append('amount_mismatch')
        if new.get('currency') != oracle.get('currency') or new.get('fxStatus') != oracle.get('fxStatus') or new.get('fxAsOf') != oracle.get('fxAsOf'):
            reasons.append('currency_fx_mismatch')
        normalized = component_values(new)
        oracle_parts = oracle.get('components') or {}
        if normalized is None or any(abs(normalized.get(k, 0) - v) > 1e-5 for k, v in oracle_parts.items() if amount(v)) or any(abs(v - oracle_parts.get(k, 0)) > 1e-5 for k, v in (normalized or {}).items()):
            reasons.append('component_not_oracle_proved')
    if row.get('classification') not in ('match', 'correction_demonstrated'):
        reasons.append('status_or_classification_gate')
    return sorted(set(reasons))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('phase5', type=Path)
    ap.add_argument('phase6', type=Path)
    ap.add_argument('output', type=Path)
    args = ap.parse_args()
    before, after = (json.loads(p.read_text()) for p in (args.phase5, args.phase6))
    assert before['summary']['snapshotId'] == after['summary']['snapshotId'] == PIN
    old, rows = before['rows'], after['rows']
    assert len(old) == len(rows) == 721
    assert before['summary']['sampling'] == after['summary']['sampling']
    assert sum(c['exactTuplesInAreas'] for c in after['summary']['cohortCensus']) == 21379
    assert sum(c['sampled'] for c in after['summary']['cohortCensus']) == 719
    for a, b in zip(old, rows):
        assert [a.get(k) for k in KEYS] == [b.get(k) for k in KEYS]
        assert [a.get('new', {}).get(k) for k in RUNTIME] == [b.get('new', {}).get(k) for k in RUNTIME]
        assert a.get('legacy') == b.get('legacy') and a.get('classification') == b.get('classification')
        assert a.get('catalogueProof') == b.get('catalogueProof')
    census = {tuple(c['key']): c for c in after['summary']['cohortCensus']}
    groups = defaultdict(list)
    residual = defaultdict(list)
    row_gates = []
    for row in rows:
        key = (PIN, row['country'], row.get('cpo'), row.get('channel'), row.get('tariffFamily'))
        gates = check(row)
        rid = row_id(row)
        groups[key].append((rid, gates, row))
        row_gates.append({'id': rid, 'cohort': key, 'gates': gates})
        oracle = (row.get('new') or {}).get('oracle') or {}
        if row.get('new', {}).get('status') == 'priced' and oracle.get('status') != 'priced':
            residual[row['country']].append({'id': rid, 'scenario': row['key'], 'stationId': row.get('stationId'), 'evseId': row.get('evseId'), 'connectorId': row.get('connectorId'), 'offerId': row.get('offerId'), 'sourcePath': row.get('catalogueProof', {}).get('sourcePath'), 'sourceSha256': row.get('catalogueProof', {}).get('sourceSha256'), 'rawKey': row.get('catalogueProof', {}).get('rawKey'), 'reason': oracle.get('reason')})
    assert {k: len(v) for k, v in residual.items()} == RESIDUAL
    matrix = []
    for key, items in sorted(groups.items(), key=lambda pair: canonical(pair[0])):
        c = census.get(key)
        sampled = len(items)
        area_total = c['exactTuplesInAreas'] if c else 0
        assert c is None or c['sampled'] == sampled
        failures = Counter(g for _, gates, _ in items for g in gates)
        observed_green = sum(not gates for _, gates, _ in items)
        matrix.append({'key': key, 'sampledRows': sampled, 'exactTuplesInQueryAreas': area_total,
            'areaSampleComplete': bool(c and sampled == area_total), 'sampleAllGatesProved': observed_green == sampled,
            'sampleProvedRows': observed_green, 'failedGates': dict(sorted(failures.items())),
            'sampleRowIds': [rid for rid, _, _ in items],
            'pinWideTupleCensusComplete': False, 'ruleBranchAndSessionCoverageComplete': False,
            'promotionEligible': False,
            'decision': 'blocked_on_sample' if failures else 'blocked_on_pin_wide_exhaustiveness'})
    result = {'snapshotId': PIN, 'sourcePhase5': args.phase5.name, 'manifestSha256': '2b7b9964d8fce26f65aaf1e508717a114cb68ca16c66fb3c06ba9a076f2db52f',
        'scope': 'same configured query areas and same 721 evaluations; no pin-wide catalogue census',
        'runtimeChanged': False, 'classificationChanged': False,
        'counts': {'rows': len(rows), 'sampledExactTuples': 719, 'exactTupleOccurrencesInQueryAreas': 21379,
            'cohortsObserved': len(matrix), 'sampleGateProvedRows': sum(not r['gates'] for r in row_gates),
            'sampleAllGatesProvedCohorts': sum(c['sampleAllGatesProved'] for c in matrix),
            'areaSampleCompleteCohorts': sum(c['areaSampleComplete'] for c in matrix),
            'promotionEligibleCohorts': 0, 'pricedWithoutOracle': sum(map(len, residual.values()))},
        'matrix': matrix, 'rowGates': row_gates, 'residual62': dict(sorted(residual.items()))}
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result['counts']))

if __name__ == '__main__':
    main()
