import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {chEdhPinnedOracle} from '../scripts/v9_tariff_phase7_source_oracle_133.mjs';
const require=createRequire(import.meta.url);
const dist=process.env.TCC_V9_DIST;
if(!dist)throw Error('TCC_V9_DIST required');
const golden=JSON.parse(fs.readFileSync(new URL('./golden/v9-tariff-phase7-ch-edh-source-133.json',import.meta.url)));
const manifest=JSON.parse(fs.readFileSync(path.join(dist,'manifest.json')));
test('two exact CH DE*EDH offers and free-time threshold; upstream CHF provenance remains blocked',()=>{
  assert.equal(golden.snapshotId,manifest.snapshotId);
  const bytes=fs.readFileSync(path.join(dist,golden.sourcePath));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),golden.sourceSha256);
  assert.equal(manifest.files.find(x=>x.path===golden.sourcePath)?.sha256,golden.sourceSha256);
  const data=JSON.parse(bytes);
  const pricing=require(path.join(dist,'runtime/assets/v9/pricing-engine.js'));
  assert.equal(golden.rawPointers.length,2);
  for(const pointer of golden.rawPointers){
    let offer=data;for(const p of pointer.slice(1).split('/'))offer=offer[p];
    const evseId=offer.evseIds[0];
    assert.equal(chEdhPinnedOracle(offer,'wrong-evse',golden.branchExpected[0]).status,'uncomputable');
    for(const spec of golden.branchExpected){
      const oracle=chEdhPinnedOracle(offer,evseId,spec);
      assert.equal(oracle.status,'priced');
      assert.equal(oracle.total,spec.total);
      assert.deepEqual(oracle.components,spec.components);
      const current=pricing.evaluateOffer(offer,{...spec,startAt:'2026-10-15T12:00:00Z',
        chargingMinutes:spec.durationMinutes,postChargeMinutes:0,stationTimeZone:'Europe/Zurich'});
      assert.equal(current.complete,true);
      assert.equal(current.totalEur,oracle.total);
      assert.equal(current.components.energy,oracle.components.energy);
      assert.equal(current.components.connectedTimeAfterFree.costEur,oracle.components.connectedTime);
    }
  }
  assert.equal(golden.originalChfSourcePinned,false);
  assert.equal(golden.promotionEligible,false);
});
