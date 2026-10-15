#!/usr/bin/env python3
"""Compare two built France runtimes after harmless file/JSON ordering differences."""
import argparse
from collections import Counter
import gzip
import hashlib
import json
from pathlib import Path


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def difference(left, right, name):
    removed = left - right
    added = right - left
    if removed or added:
        raise AssertionError(f'{name} business multiset differs: removed={list(removed.items())[:8]} '
                             f'added={list(added.items())[:8]}')


def rows(path):
    with gzip.open(path, 'rt', encoding='utf-8') as stream:
        result = json.load(stream)
    if not isinstance(result, list):
        raise AssertionError('France all.json.gz must be a list')
    return result


def offers(path):
    payload = json.loads(path.read_text())
    result = {}
    for name in ('directOffers', 'subscriptionOffers'):
        result[name] = Counter(canonical(offer) for offer in payload.get(name, []))
    residual = {key: value for key, value in payload.items() if key not in result}
    result['metadata'] = Counter([canonical(residual)])
    return result


def summarize(data):
    evses = {(row[0], evse) for row in data for group in row[8] for evse in group[6]}
    connectors = Counter((row[0], evse, group[1], group[2], float(group[3]))
                         for row in data for group in row[8] for evse in group[6])
    return {'stations': len(data), 'stationEvsePairs': len(evses),
            'connectorEntries': sum(connectors.values()),
            'normalEntries': sum(n for (_, _, label, _, _), n in connectors.items() if 'EF' in label or 'Prise normale' in label),
            'type2Entries': sum(n for (_, _, label, _, _), n in connectors.items() if 'Type 2' in label),
            'ccsEntries': sum(n for (_, _, label, _, _), n in connectors.items() if 'CCS' in label)}


def tiles(root):
    manifest = json.loads((root / 'manifest.json').read_text())
    result = {}
    for entry in manifest['tiles']:
        key = entry['id']
        if key in result:
            raise AssertionError(f'Duplicate France tile: {key}')
        metadata = {name: value for name, value in entry.items()
                    if name not in ('file', 'bytes', 'sha256')}
        result[key] = (canonical(metadata), Counter(canonical(row) for row in rows(root / entry['file'])))
    return result


def main(left, right):
    a = left / 'runtime/data/v9'
    b = right / 'runtime/data/v9'
    old = rows(a / 'france-static/all.json.gz')
    new = rows(b / 'france-static/all.json.gz')
    difference(Counter(canonical(row) for row in old), Counter(canonical(row) for row in new), 'France station/EVSE/connector/power/status')
    left_tiles, right_tiles = tiles(a / 'france-static'), tiles(b / 'france-static')
    if left_tiles.keys() != right_tiles.keys():
        raise AssertionError(f'France tile IDs differ: removed={sorted(left_tiles.keys() - right_tiles.keys())} '
                             f'added={sorted(right_tiles.keys() - left_tiles.keys())}')
    for tile_id in left_tiles:
        if left_tiles[tile_id][0] != right_tiles[tile_id][0]:
            raise AssertionError(f'France tile {tile_id} geometry/count differs')
        difference(left_tiles[tile_id][1], right_tiles[tile_id][1], f'France tile {tile_id}')
    if summarize(old) != summarize(new):
        raise AssertionError(f'France counters differ: {summarize(old)} / {summarize(new)}')
    offer_report = {}
    for file in ('france-belib-offers.json', 'france-bump-offers.json'):
        first, second = offers(a / file), offers(b / file)
        for section in first:
            difference(first[section], second[section], f'{file}:{section}')
        offer_report[file] = {section: sum(counter.values()) for section, counter in first.items() if section != 'metadata'}
    print(json.dumps({'france': summarize(old), 'offers': offer_report,
                      'normalizedBusinessDifference': 0,
                      'rawAllSha256': [hashlib.sha256((root / 'france-static/all.json.gz').read_bytes()).hexdigest()
                                       for root in (a, b)]}, sort_keys=True))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('reference', type=Path)
    parser.add_argument('direct', type=Path)
    args = parser.parse_args()
    main(args.reference, args.direct)
