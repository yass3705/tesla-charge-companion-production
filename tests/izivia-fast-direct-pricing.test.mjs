import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const pricing=require('../runtime-overrides/assets/v9/pricing-engine.js');
const file=process.argv[2]||'dist/v9-izivia-fast-candidate/snapshot-inputs/FR/direct/izivia_fast_direct_offers.json';
const data=JSON.parse(readFileSync(file,'utf8'));
const ac=data.directOffers.find(x=>x.connectorKinds.includes('AC')&&x.metadata.powerKw===22);
assert.ok(ac,'22 kW Type2 direct offer missing');
assert.equal(ac.metadata.timeZone,'Europe/Paris');
assert.ok(ac.pricing.rules.every(x=>x.connectedTimeAfterFreeStepSeconds===60));
const evaluate=(startAt,durationMinutes,energyKwh=10.1)=>pricing.evaluateOffer(ac,{
  startAt,durationMinutes,chargingMinutes:durationMinutes,energyKwh
});
for(const [at,expected] of [
  ['2026-10-12T06:30:00Z',3.85],
  ['2026-10-12T07:30:00Z',3.30],
  ['2026-10-12T08:59:00Z',3.30],
  ['2026-10-12T09:00:00Z',3.85],
  ['2026-10-12T13:30:00Z',3.30],
  ['2026-10-12T15:00:00Z',3.85],
]){
  const q=evaluate(at,60);
  assert.equal(q.complete,true,JSON.stringify(q));
  assert.ok(Math.abs(q.totalEur-expected)<1e-7,at+': '+q.totalEur+' expected '+expected);
}
for(const [duration,extra] of [[60,0],[60.01,0.30],[61,0.30],[61.01,0.60]]){
  const q=evaluate('2026-10-12T07:30:00Z',duration);
  assert.equal(q.complete,true,JSON.stringify(q));
  assert.ok(Math.abs(q.totalEur-(3.30+extra))<1e-7,'duration '+duration+' got '+q.totalEur);
}
assert.equal(evaluate('2026-10-12T08:59:00Z',120,10.1).totalEur,21.30,
  'session start tariff must remain 0.30 even after 11h; 60 connected minutes over threshold');
console.log('IZIVIA FAST Type2/CCS direct session tariff scenarios validated');
