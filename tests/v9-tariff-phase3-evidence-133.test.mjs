import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=relative=>JSON.parse(fs.readFileSync(new URL(relative,import.meta.url)));
const report=read('../reports/v9-tariff-133/dualrun-phase3-pin-2026-10-15.json');
const coverage=read('../reports/v9-tariff-133/coverage-phase3-pin-2026-10-15.json');
const bois=read('../reports/v9-tariff-133/electra-bois-d-arcy-phase3.json');
const lully=read('../reports/v9-tariff-133/lully-direct-phase3.json');

assert.equal(report.rows.length,79);
assert.deepEqual(report.summary.byClassification,
  {match:75,data_insufficient:2,correction_demonstrated:2});
assert.deepEqual(report.summary.catalogueProof,
  {exact_catalogue_link:59,no_exact_runtime_offer:2,exact_derived_catalogue_link:18});
for(const row of report.rows.filter(x=>x.catalogueProof.state==='exact_derived_catalogue_link')){
  assert(row.catalogueProof.rawKey&&row.catalogueProof.sourceSha256&&
    row.catalogueProof.exactAssertions.length>0,row.offerId);
  assert.equal(row.catalogueProof.rawKey,row.new.oracle.rawKey);
}
for(const row of report.rows.filter(x=>x.classification==='correction_demonstrated')){
  assert.equal(row.country,'MA');
  assert.equal(row.catalogueProof.state,'exact_derived_catalogue_link');
  assert.equal(row.new.total,0);
  assert.equal(row.new.oracle.total,0);
}
assert.equal(coverage.afterPhase3.RawOffer,666631);
assert.equal(coverage.activeDotnlSource.rawOffers,87984);
assert.equal(bois.stations.length,3);
assert.equal(bois.stations.reduce((n,s)=>n+s.pdcCount,0),28);
assert.equal(bois.offersWithExactPdcAtTheseStations,12);
assert.equal(lully.pdcCount,4);
assert.equal(lully.registryActive['e55c-direct-france'],false);
assert.equal(lully.activeExactOfferForStation,false);
console.log('V9 Phase 3 source scope, lineage and blocked activation evidence OK');
