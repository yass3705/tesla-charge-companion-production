import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const payload=JSON.parse(fs.readFileSync(path.join(root,'runtime-overrides/data/v9/electra-bois-darcy-direct.json'),'utf8'));
const pricing=require(path.join(root,'runtime-overrides/assets/v9/pricing-engine.js'));
const offer=payload.directOffers[0];

assert.deepEqual(offer.stationIds,['FRELCP12954082']);
assert.deepEqual(offer.connectorKinds,['DC']);
assert.equal(offer.metadata.officialStationId,'0a650b39-b871-4e78-9670-e56e6b20f329');
assert.equal(offer.pricing.lockAtSessionStart,true);
assert.equal(offer.pricing.postChargeFeeUnknown,true);
assert.equal(offer.metadata.conditionalCongestionFeeExcluded,true);

for(const [startAt,expected] of [
  ['2026-10-06T01:30:00Z',3.9], // 03:30 Paris
  ['2026-10-06T12:55:00Z',4.9], // 14:55 Paris; session crosses the 15:00 change
  ['2026-10-06T15:00:00Z',6.1], // 17:00 Paris
  ['2026-10-06T19:00:00Z',4.9]  // 21:00 Paris
]){
  const result=pricing.evaluateOffer(offer,{startAt,energyKwh:10,durationMinutes:60});
  assert.equal(result.complete,true,startAt);
  assert.equal(result.totalEur,expected,startAt);
  assert.equal(result.segmented,false,startAt);
}

const other={...offer,pricing:{...offer.pricing,lockAtSessionStart:false}};
assert.ok(pricing.evaluateOffer(other,{startAt:'2026-10-06T12:55:00Z',energyKwh:10,durationMinutes:60}).segmented,
  'ordinary time-window tariffs must still be segmented');
console.log('Electra Bois-d’Arcy exact energy tariff and session-start locking OK');
