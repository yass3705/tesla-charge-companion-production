#!/usr/bin/env python3
"""Qualify two bounded pin-wide cohorts; fail closed on missing upstream source."""
import argparse
import hashlib
import json
import sqlite3
from collections import Counter
from pathlib import Path

PIN='2026-10-15-v9-tesla-mac-ingress-verified'
MANIFEST='2b7b9964d8fce26f65aaf1e508717a114cb68ca16c66fb3c06ba9a076f2db52f'
FIELDS=('key','country','stationId','evseId','connectorId','offerId','cpo','channel','tariffFamily','sourceOffers','new','legacy','classification','catalogueProof')

def load(p):return json.loads(Path(p).read_text())

def main():
    ap=argparse.ArgumentParser()
    for name in ('database','dist','inventory','phase6','phase7','midhope_branches','midhope_golden','ch_golden','shadow','output'):
        ap.add_argument(name,type=Path)
    a=ap.parse_args()
    manifest_bytes=(a.dist/'manifest.json').read_bytes()
    assert hashlib.sha256(manifest_bytes).hexdigest()==MANIFEST
    manifest=json.loads(manifest_bytes)
    assert manifest['snapshotId']==PIN
    paths={x['path']:x['sha256'] for x in manifest['files']}
    inventory,old,new,branches,mid,chw,shadow=map(load,(a.inventory,a.phase6,a.phase7,
        a.midhope_branches,a.midhope_golden,a.ch_golden,a.shadow))
    assert all(x['snapshotId']==PIN for x in (inventory,mid,chw,shadow))
    assert old['summary']['snapshotId']==new['summary']['snapshotId']==branches['summary']['snapshotId']==PIN
    assert len(old['rows'])==len(new['rows'])==721
    assert old['summary']['sampling']==new['summary']['sampling']
    for before,after in zip(old['rows'],new['rows']):
        assert all(before.get(k)==after.get(k) for k in FIELDS),before.get('offerId')
    assert inventory['catalogueCounts']=={'RawOffer':666631,'OfferScope':710386,'SourceStation':362234,
        'ChargePoint':654932,'Connector':460144}
    assert len(inventory['cohorts'])==757
    assert shadow['secondEngine']['tuples']==719 and shadow['secondEngine']['enabled']['calls']==719
    assert shadow['secondEngine']['defaultDisabled']['calls']==0
    assert shadow['secondEngine']['rollback']['candidateCallsAfter']==0
    old_residual=[r for r in old['rows'] if r.get('new',{}).get('status')=='priced' and
        r.get('new',{}).get('oracle',{}).get('status')!='priced']
    insufficient=[r for r in old['rows'] if r.get('classification')=='data_insufficient']
    assert len(old_residual)==62 and len(insufficient)==18
    db=sqlite3.connect(f'file:{a.database}?mode=ro',uri=True)
    selected=[]
    cohorts=[('Midhope',('GB','Connected Kerb Midhope Road verified four connector guest tariff (summer 2026)',
        'Direct','connected_kerb_midhope_guest_verified'),mid,4),
        ('CH DE*EDH',('CH','DE*EDH','Direct','rules'),chw,2)]
    for label,suffix,golden,expected_count in cohorts:
        key=(PIN,*suffix)
        census=next(c for c in inventory['cohorts'] if tuple(c['key'])==key)
        assert census['rawOfferCount']==census['offerScopeCount']==census['uniqueExactSourceTuples']==expected_count
        assert census['exactPointCount']==census['exactConnectorCount']==expected_count
        assert census['exactStationCount']==1
        assert set(census['scopeStatuses']).issubset({'exact_unique','source_exact_join'})
        raw_keys=([f"{mid['sourcePath']}:/sources/0/locations/0/evses/{i}/connectors/0/validatedV9Offer" for i in range(4)]
            if label=='Midhope' else [f"{chw['sourcePath']}:directOffers:{i}" for i in (7170,7171)])
        assert hashlib.sha256(''.join(k+'\n' for k in sorted(raw_keys)).encode()).hexdigest()==census['rawKeysSha256']
        assertions=[]
        historical_winter_annotation=False
        for raw_key in raw_keys:
            r=db.execute('SELECT country,cpo,channel,offer_id,source_path,source_sha256,raw_json FROM RawOffer WHERE raw_key=?',(raw_key,)).fetchone()
            assert r and r[:3]==suffix[:3]
            if label=='Midhope':
                offer=json.loads(r[6]);metadata=offer.get('metadata',{});pricing=offer.get('pricing',{})
                historical_winter_annotation |= metadata.get('winterEvidence')=='not_confirmed_not_activated'
                assert offer.get('validFrom')==metadata.get('tariffObservedAt')=='2026-10-10'
                assert not offer.get('validTo') and metadata.get('pricingTimeZone')=='Europe/London'
                assert metadata.get('refreshPolicy')=='revalidate exact CPO guest price on new tariff evidence; DST alone does not expire the price'
                assert metadata.get('scheduleBasis')=='customer app 09:30-19:00 Europe/Paris = 08:30-18:00 Europe/London, including DST'
                assert (pricing.get('energyPerKwhGbp'),pricing.get('parkingPerStarted30minGbp'),
                    pricing.get('idleSupplementPerMinuteGbp'))==(0.39996,0.80004,0.01)
            assert r[4]==golden['sourcePath'] and r[5]==golden['sourceSha256']==paths[r[4]]
            scopes=db.execute('SELECT scope_kind,source_id,point_key,connector_key,link_status FROM OfferScope WHERE raw_key=?',(raw_key,)).fetchall()
            assert len(scopes)==1 and scopes[0][4] in ('exact_unique','source_exact_join')
            kind,source_id,point_key,connector_key,status=scopes[0]
            if connector_key:
                point_key=db.execute('SELECT point_key FROM Connector WHERE connector_key=?',(connector_key,)).fetchone()[0]
            else:
                connector_key=db.execute('SELECT connector_key FROM Connector WHERE point_key=?',(point_key,)).fetchone()[0]
            station_key=db.execute('SELECT station_key FROM ChargePoint WHERE point_key=?',(point_key,)).fetchone()[0]
            assertions.append({'rawKey':raw_key,'offerId':r[3],'sourcePath':r[4],'sourceSha256':r[5],
                'scopeKind':kind,'scopeSourceId':source_id,'linkStatus':status,'stationKey':station_key,
                'pointKey':point_key,'connectorKey':connector_key})
        assert len({x['rawKey'] for x in assertions})==expected_count
        assert len({x['connectorKey'] for x in assertions})==expected_count
        if label=='Midhope':assert historical_winter_annotation  # Preserve historical bytes; never use as a tariff gate.
        prior_rows=sum(x['sampleRows'] for x in inventory['runtimeToCatalogueCrosswalk'] if
            key in [tuple(k) for k in x['catalogueKeys']])
        selected.append({'name':label,'key':key,'census':census,'phase6SampleRows':prior_rows,
            'exactAssertions':assertions})
    mid_rows=branches['rows'];assert len(mid_rows)==mid['evaluations']==64
    assert Counter(r['key'] for r in mid_rows)==Counter({f'GB-Midhope-P7-{k}':4 for k in mid['branchExpected']})
    mid_ids={x['rawKey'] for x in selected[0]['exactAssertions']}
    for r in mid_rows:
        assert r['catalogueProof']['rawKey'] in mid_ids
        assert r['catalogueProof']['sourceSha256']==mid['sourceSha256']
        branch=r['key'].removeprefix('GB-Midhope-P7-');expected=mid['branchExpected'][branch]
        assert r['new']['status']==expected['status'] and not r['legacy']['differences']
        if expected['status']=='priced':
            assert r['new']['total']==expected['total']
            parts=r['new']['componentValues']
            assert parts['energy']==expected['components']['energy']
            assert parts['parkingTime']['costGbp']==expected['components']['parkingTime']
            assert parts['idleSupplement']['costGbp']==expected['components']['idleSupplement']
    selected_raw={x['rawKey'] for item in selected for x in item['exactAssertions']}
    assert not any(r.get('catalogueProof',{}).get('rawKey') in selected_raw for r in old_residual+insufficient)
    assert 'data/switzerland/de-edh-direct-tariffs.json' not in paths
    selected[0].update({'branchScenarios':len(mid['branchExpected']),'branchEvaluations':len(mid_rows),
        'independentSourceOracle':'midhopeSourceOracle; exact pinned bytes and manual golden',
        'originalSupplierSourcePinned':True,'pinWideCandidate':True,
        'priceFreshness':{'observedAt':'2026-10-10','snapshotAsOf':'2026-10-15',
            'validFrom':'2026-10-10','validTo':None,
            'decision':'proved_for_immutable_pin_only; revalidate on newer supplier evidence'},
        'branchCoverage':{'energy':'proved_all_four','fixed_fee':'absent_preauthorisation_excluded',
            'time':'proved_parking_and_idle','parking':'proved_weekday_sunday_and_window_boundaries',
            'hourly_dst':'year_round_local_schedule_proved; UTC_offset_only_changes','threshold':'proved_started_30_minute_blocks',
            'cap':'absent_in_complete_source_pricing_object','subscription':'absent_in_complete_source_offer',
            'congestion':'absent_in_complete_source_pricing_object','fx':'GBP_and_2026_10_15_dated_EUR_proved',
            'validity':'before_validFrom_rejected'},
        'blockedReason':None,
        'candidateScope':'only this immutable pin and exact four connectors; flag remains off'})
    selected[1].update({'branchScenarios':len(chw['branchExpected']),'branchEvaluations':
        len(chw['branchExpected'])*2,'independentSourceOracle':'chEdhPinnedOracle on derived EUR payload',
        'originalSupplierSourcePinned':False,'pinWideCandidate':False,
        'branchCoverage':{'energy':'proved_derived_eur_bytes','fixed_fee':'absent_in_derived_offer',
            'time':'proved_connected_time','parking':'no_separate_parking_component',
            'hourly_dst':'all_day_rule_only','threshold':'proved_239_240_241_300_minutes',
            'cap':'absent_in_derived_offer','subscription':'absent_in_derived_offer',
            'congestion':'absent_in_derived_offer','fx':'upstream_chf_and_dated_conversion_not_pinned',
            'validity':'no_explicit_validity_window_in_derived_offer'},
        'blockedReason':'upstream CHF tariff and dated FX source are not pinned; derived EUR bytes alone do not prove supplier price'})
    result={'snapshotId':PIN,'manifestSha256':MANIFEST,'catalogueCounts':inventory['catalogueCounts'],
        'globalIdentifierSha256':inventory['globalIdentifierSha256'],
        'pinWideCohorts':len(inventory['cohorts']),'phase6ObservedRuntimeCohorts':181,
        'runtimeCohortsWithUniqueCatalogueCohort':inventory['runtimeCohortsWithUniqueCatalogueCohort'],
        'catalogueCohortsRepresentedBySample':inventory['catalogueCohortsRepresentedBySample'],
        'queryAreaUniqueExactTuples':new['summary']['uniqueExactTuplesInQueryAreas'],
        'queryAreaSessionOccurrences':new['summary']['sampling']['exactTuplesInAreas'],
        'same721RuntimeRows':True,'residualPricedWithoutOracle':62,'insufficientDivergences':18,
        'selected':selected,'pinWideCandidateCount':sum(x['pinWideCandidate'] for x in selected),
        'activationCount':0,'siteKeyUsedForTariffJoin':False}
    a.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'pinWideCohorts':len(inventory['cohorts']),'candidates':result['pinWideCandidateCount']}))
if __name__=='__main__':main()
