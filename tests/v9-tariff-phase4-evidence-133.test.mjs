import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
const root=new URL('../',import.meta.url);
const read=p=>JSON.parse(fs.readFileSync(new URL(p,root)));
const golden=read('tests/golden/v9-tariff-phase4-133.json');
const coverage=read('reports/v9-tariff-133/coverage-phase4-pin-2026-10-15.json');
const reportPath=new URL('reports/v9-tariff-133/dualrun-phase4-pin-2026-10-15.json',root);
const run=JSON.parse(fs.readFileSync(reportPath));
test('bounded sample and conservation remain explicit',()=>{
  assert.equal(coverage.snapshotId,golden.snapshotId);
  assert.deepEqual(coverage.catalogue,golden.catalogue);
  assert.equal(coverage.sampling.sampled,golden.sampledExactTuples);
  assert.equal(coverage.rows,golden.rows);
  assert.equal(coverage.rows,coverage.sampling.sampled+2);
  assert.deepEqual(coverage.summary.status,golden.states);
  assert.deepEqual(coverage.summary.classification,golden.classifications);
  assert.deepEqual(coverage.summary.catalogueProof,golden.catalogueProof);
  assert.equal(coverage.summary.oracle.priced,golden.independentOraclePriced);
  assert.equal(coverage.stopGates.pricedWithoutIndependentOracle,golden.pricedWithoutIndependentOracle);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(reportPath)).digest('hex'),coverage.dualrunSha256);
  assert.equal(coverage.byCountryCpoChannelPowerFamily.reduce((n,x)=>n+x.rows,0),coverage.rows);
});
test('all exact Electra offers retain source station and congestion refusal',()=>{
  const congested=run.rows.filter(x=>x.key==='FR-bois-d-arcy');
  const clear=run.rows.filter(x=>x.key==='FR-bois-d-arcy-no-congestion');
  assert.equal(congested.length,golden.electraExactOffersPerScenario);
  assert.equal(clear.length,golden.electraExactOffersPerScenario);
  assert.deepEqual(new Set(congested.map(x=>x.offerId)),new Set(clear.map(x=>x.offerId)));
  for(const row of congested){
    assert.equal(row.stationId,'FR:national:FRELCP12954082');
    assert.equal(row.catalogueProof.state,'exact_catalogue_link');
    assert.equal(row.new.status,'uncomputable');
  }
  for(const row of clear){
    assert.equal(row.stationId,'FR:national:FRELCP12954082');
    assert.equal(row.catalogueProof.state,'exact_catalogue_link');
    assert.equal(row.new.status,'priced');
    assert.equal(row.new.total,golden.electraNoCongestionEur);
  }
});
test('unresolved stations and unsupported subscription are never priced',()=>{
  for(const key of ['DE','GB-GeniePoint']){
    const row=run.rows.find(x=>x.key===key);
    assert.equal(row.status,'no_exact_offer');
    assert.equal(row.catalogueProof.state,'no_exact_runtime_offer');
    assert.equal(row.classification,'data_insufficient');
    assert.equal(row.new,undefined);
  }
  const subscriptions=run.rows.filter(x=>x.new?.status==='ineligible');
  assert.equal(subscriptions.length,12);
  assert.ok(subscriptions.every(x=>x.new.reason==='subscription_not_selected'));
  assert.equal(run.rows.filter(x=>x.classification==='regression').length,0);
});
