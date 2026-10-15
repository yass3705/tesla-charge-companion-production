#!/usr/bin/env python3
"""Exercise add, already-present, and divergent EVSE on the pinned France sources."""
import gzip
import hashlib
import json
import pathlib
import shutil
import sys
import tempfile

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'scripts'))
from supplement_france_irve_exact import supplement as belib, read_gzip, write_gzip
from supplement_france_bump_active import supplement as bump

ROOT = pathlib.Path(__file__).resolve().parents[1]
CFG = json.loads((ROOT / 'config/snapshots/2026-10-13-be-energyvision-france-irve-handoff-candidate.json').read_text())


def main(stable, datalab):
    source = datalab / 'data/national/france-irve-static-v9/all.json.gz'
    dynamic = datalab / 'data/national/france-irve-dynamic-status-v9.json.gz'
    catalogue = datalab / 'data/national/belib_stations_paris.json'
    old_static = stable / 'v9-production-runtime/data/v9/france-static'
    bcfg = CFG['franceBelibExactSupplement']
    pcfg = CFG['franceBumpActiveSupplement']

    def apply_belib(target):
        return belib(target, source, dynamic, catalogue, bcfg['stationIds'],
                     bcfg['staticSha256'], bcfg['dynamicSourceSha256'])

    def apply_bump(target):
        return bump(target, source, dynamic, ROOT / pcfg['evidencePath'],
                    pcfg['staticSha256'], pcfg['dynamicSha256'])

    with tempfile.TemporaryDirectory(prefix='tcc104-fr-') as temporary:
        base = pathlib.Path(temporary)
        absent = base / 'absent'
        shutil.copytree(old_static, absent)
        first_b = apply_belib(absent)
        first_p = apply_bump(absent)
        assert 'alreadyPresentStationIds' not in first_b
        assert 'alreadyPresentStationIds' not in first_p
        assert json.loads((absent / 'manifest.json').read_text())['stationCount'] == 48083

        present = base / 'present'
        shutil.copytree(datalab / 'data/national/france-irve-static-v9', present)
        manifest = json.loads((present / 'manifest.json').read_text())
        for tile in manifest['tiles']:
            name = pathlib.Path(tile['file']).name
            shutil.copy2(present / tile['file'], present / name)
            tile['file'] = name
        (present / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, separators=(',', ':')) + '\n')
        original_hash = hashlib.sha256((present / 'all.json.gz').read_bytes()).hexdigest()
        second_b = apply_belib(present)
        second_p = apply_bump(present)
        assert len(second_b['alreadyPresentStationIds']) == 4 and second_b['addedStationIds'] == []
        assert len(second_p['alreadyPresentStationIds']) == 21 and second_p['addedStationIds'] == []
        assert hashlib.sha256((present / 'all.json.gz').read_bytes()).hexdigest() == original_hash
        assert json.loads((present / 'manifest.json').read_text())['stationCount'] == 49185
        historic = {row[0]: row for row in read_gzip(absent / 'all.json.gz')}
        national = {row[0]: row for row in read_gzip(present / 'all.json.gz')}
        approved_station_ids = set(bcfg['stationIds']) | set(second_p['alreadyPresentStationIds'])
        extra = set()
        for station_id in approved_station_ids:
            prior, current = historic[station_id], national[station_id]
            prior_ids = {evse.upper() for group in prior[8] for evse in group[6]}
            current_ids = {evse.upper() for group in current[8] for evse in group[6]}
            assert prior_ids <= current_ids
            extra.update(current_ids - prior_ids)
        assert len(extra) == 11
        active = {item.upper() for item in read_gzip(dynamic)['enServicePdcIds']}
        assert not extra & active, 'New national EVSE unexpectedly gained active status'
        for filename in ('france-belib-offers.json', 'france-bump-offers.json'):
            source_offers = json.loads((stable / 'v9-production-runtime/data/v9' / filename).read_text())
            offered = {evse.upper() for section in ('directOffers', 'subscriptionOffers')
                       for offer in source_offers.get(section, []) for evse in offer.get('evseIds', [])}
            assert not extra & offered, 'New national EVSE unexpectedly has a historical offer'

        # A changed approved connector must be diagnosed, never treated as present.
        for label, station_id, apply in [
            ('Belib', 'FRV75PPX0750', apply_belib),
            ('BUMP', 'FRBMPP752936P', apply_bump),
        ]:
            divergent = base / label.lower()
            shutil.copytree(present, divergent)
            rows = read_gzip(divergent / 'all.json.gz')
            row = next(row for row in rows if row[0] == station_id)
            row[8][0][3] = float(row[8][0][3]) + 1
            write_gzip(divergent / 'all.json.gz', rows)
            try:
                apply(divergent)
            except (ValueError, AssertionError) as exc:
                assert station_id in str(exc) and 'connector mismatch' in str(exc), str(exc)
            else:
                raise AssertionError(f'{label} divergent approved EVSE was accepted')

    print(json.dumps({'absentAddedStations': 25, 'presentVerifiedStations': 25,
                      'presentNationalStations': 49185, 'newUnpricedUnconfirmedEvse': 11,
                      'divergentBlocked': ['Belib', 'BUMP']}))


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('usage: test_france_irve_handoff_idempotence.py STABLE_OLD DATALAB_PINNED')
    main(pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]))
