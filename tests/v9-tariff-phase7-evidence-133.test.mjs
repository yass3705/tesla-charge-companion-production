import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
const read=name=>JSON.parse(fs.readFileSync(new URL(name,import.meta.url)));
const inventory=read('../reports/v9-tariff-133/phase7-inventory-pin-2026-10-15.json');
const qualification=read('../reports/v9-tariff-133/phase7-qualification-pin-2026-10-15.json');
const before=read('../reports/v9-tariff-133/dualrun-phase6-pin-2026-10-15.json');
const after=read('../reports/v9-tariff-133/dualrun-phase7-pin-2026-10-15.json');
const branches=read('../reports/v9-tariff-133/phase7-midhope-branches-pin-2026-10-15.json');
const second=read('../reports/v9-tariff-133/phase7-second-engine-pin-2026-10-15.json');
const golden=read('./golden/v9-tariff-phase7-133.json');
test('pin-wide catalogue census, exact crosswalk and no site tariff propagation',()=>{
  assert.equal(inventory.snapshotId,golden.snapshotId);
  assert.deepEqual(inventory.catalogueCounts,golden.catalogueCounts);
  assert.deepEqual(inventory.globalIdentifierSha256,golden.globalIdentifierSha256);
  assert.equal(inventory.cohorts.length,golden.pinWideCohorts);
  assert.equal(inventory.cohorts.reduce((n,c)=>n+c.rawOfferCount,0),666631);
  assert.equal(inventory.cohorts.reduce((n,c)=>n+c.offerScopeCount,0),710386);
  assert.equal(inventory.cohorts.reduce((n,c)=>n+c.uniqueExactSourceTuples,0),golden.uniqueExactSourceTuples);
  assert.equal(Object.values(inventory.sourceStationByCountry).reduce((a,b)=>a+b,0),362234);
  assert.equal(Object.values(inventory.chargePointByCountry).reduce((a,b)=>a+b,0),654932);
  assert.equal(Object.values(inventory.connectorByCountry).reduce((a,b)=>a+b,0),460144);
  assert.equal(inventory.phase6ObservedCohorts,golden.phase6ObservedRuntimeCohorts);
  assert.equal(inventory.runtimeCohortsWithUniqueCatalogueCohort,golden.runtimeCohortsWithUniqueCatalogueCohort);
  assert.equal(inventory.catalogueCohortsRepresentedBySample,golden.catalogueCohortsRepresentedBySample);
  assert.equal(inventory.runtimeToCatalogueCrosswalk.length,181);
  assert.ok(inventory.cohorts.every(c=>c.uniqueExactSourceTuples>=0&&c.exactConnectorCount>=0));
  assert.ok(inventory.cohorts.every(c=>!('siteKey' in c)));
});
test('selected cohort branches and all original refusal gates remain intact',()=>{
  assert.equal(qualification.manifestSha256,golden.manifestSha256);
  assert.equal(qualification.pinWideCandidateCount,golden.candidateCount);
  assert.equal(qualification.activationCount,0);
  assert.equal(qualification.siteKeyUsedForTariffJoin,false);
  assert.equal(qualification.residualPricedWithoutOracle,golden.residual62);
  assert.equal(qualification.insufficientDivergences,golden.insufficient18);
  assert.equal(qualification.queryAreaUniqueExactTuples,golden.queryAreaUniqueExactTuples);
  assert.equal(qualification.queryAreaSessionOccurrences,golden.queryAreaSessionOccurrences);
  assert.equal(qualification.selected.length,2);
  assert.deepEqual(qualification.selected.map(s=>Object.fromEntries(Object.entries(s).filter(([k])=>
    ['name','key','phase6SampleRows','branchScenarios','branchEvaluations','originalSupplierSourcePinned','pinWideCandidate'].includes(k)))),golden.selected);
  for(const s of qualification.selected){
    assert.equal(s.exactAssertions.length,s.census.rawOfferCount);
    assert.equal(new Set(s.exactAssertions.map(x=>x.rawKey)).size,s.exactAssertions.length);
    assert.equal(new Set(s.exactAssertions.map(x=>x.connectorKey)).size,s.exactAssertions.length);
    const digest=crypto.createHash('sha256').update(s.exactAssertions.map(x=>x.rawKey+'\n').sort().join('')).digest('hex');
    assert.equal(digest,s.census.rawKeysSha256);
    assert.ok(s.exactAssertions.every(x=>x.linkStatus==='exact_unique'||x.linkStatus==='source_exact_join'));
  }
  assert.equal(branches.rows.length,36);
  assert.equal(second.secondEngine.enabled.callback.count,719);
  assert.equal(second.secondEngine.defaultDisabled.calls,0);
  assert.equal(second.secondEngine.rollback.candidateCallsAfter,0);
});
test('same 721 runtime results and source scopes as Phase 6',()=>{
  assert.equal(before.rows.length,721);assert.equal(after.rows.length,721);
  assert.deepEqual(before.summary.sampling,after.summary.sampling);
  for(let i=0;i<721;i++)assert.deepEqual(after.rows[i],before.rows[i],`row ${i}`);
});
