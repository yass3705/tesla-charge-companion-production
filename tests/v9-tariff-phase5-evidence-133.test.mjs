import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url)));
const golden=read('./golden/v9-tariff-phase5-133.json');
const proof=read('../reports/v9-tariff-133/phase5-proof-pin-2026-10-15.json');
const run=read('../reports/v9-tariff-133/dualrun-phase5-pin-2026-10-15.json');
test('same pin, same 721 exact tuples and immutable catalogue',()=>{
  assert.equal(proof.snapshotId,golden.snapshotId);
  assert.equal(proof.manifestSha256,golden.manifestSha256);
  assert.deepEqual(proof.catalogue,golden.catalogue);
  assert.equal(proof.sample.rows,golden.rows);
  assert.equal(run.rows.length,golden.rows);
  assert.equal(proof.sample.selectedExactTuples,719);
  assert.equal(proof.intersection.originalLineageGapAndOracleGap,golden.intersection);
  assert.equal(proof.intersection.originalUnion,golden.union);
});
test('151 old gaps have exact pinned source pointers without site scope',()=>{
  assert.equal(proof.lineage151.length,151);
  assert.deepEqual(proof.lineageByCountryAndRoot,golden.lineageRoots);
  for(const item of proof.lineage151){
    assert.equal(item.after,'exact_derived_catalogue_link');
    assert.ok(item.rawKey?.startsWith(item.sourcePath+':'));
    assert.match(item.sourceSha256,/^[a-f0-9]{64}$/);
    assert.ok(item.exactAssertions.length>0);
    assert.ok(item.exactAssertions.every(x=>x.scopeKind!=='Site'));
    if(item.equivalentRawOffers.length){
      assert.equal(item.equivalentRawOffers.length,2);
      assert.ok(item.equivalentRawOffers.every(x=>/^[a-f0-9]{64}$/.test(x.sourceSha256)));
    }
  }
  assert.deepEqual(proof.after.catalogueProof,golden.after.catalogueProof);
});
test('180 newly proved, 50 old gaps remain and 12 prior Italian claims are refused',()=>{
  assert.equal(proof.oracle230.length,230);
  for(const [field,value] of Object.entries(golden.oracleTransition))
    assert.equal(proof.oracleTransition[field],value);
  for(const [field,value] of Object.entries(golden.after))
    assert.deepEqual(proof.after[field],value);
  assert.deepEqual(proof.after.pricedOracleMismatches,[]);
  assert.equal(proof.oracle230.filter(x=>x.afterOracle==='priced'&&x.amountMatches).length,180);
  assert.equal(proof.phase4Discrepancies18.length,18);
  const disputed=run.rows.filter(x=>x.classification==='data_insufficient');
  assert.equal(disputed.length,18);
  assert.ok(disputed.every(x=>x.new?.oracle?.status!=='priced'||x.status==='no_exact_offer'));
  for(const key of ['DE','GB-GeniePoint']){
    const row=run.rows.find(x=>x.key===key);
    assert.equal(row.status,'no_exact_offer');
    assert.equal(row.new,undefined);
  }
  for(const key of ['FR-bois-d-arcy','FR-bois-d-arcy-no-congestion']){
    const rows=run.rows.filter(x=>x.key===key);
    assert.equal(rows.length,12);
    assert.ok(rows.every(x=>x.stationId==='FR:national:FRELCP12954082'));
  }
});
