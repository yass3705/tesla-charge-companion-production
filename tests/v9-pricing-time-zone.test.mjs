import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const pricing=require('../runtime-overrides/assets/v9/pricing-engine.js');

const offer=timeZone=>({id:'uk-window',currency:'GBP',pricing:{type:'rules',timeZone,rules:[
  {scope:'timeWindow',start:'22:00',end:'02:00',pricePerKwh:.2},
  {scope:'timeWindow',start:'02:00',end:'22:00',pricePerKwh:.4}
]}});
const quote=(timeZone,startAt,durationMinutes=30)=>pricing.evaluateOffer(offer(timeZone),{
  startAt,durationMinutes,chargingMinutes:durationMinutes,energyKwh:durationMinutes/6
});
for(const startAt of ['2026-10-25T00:30:00Z','2026-10-25T01:30:00Z']){
  const result=quote('Europe/London',startAt);
  assert.equal(result.complete,true,startAt);
  assert.equal(result.totalEur,1,'both repeated 01:30 local times use the overnight tariff');
}
assert.equal(quote('Europe/London','2026-03-29T00:30:00Z').totalEur,1,'before the spring clock jump');
assert.equal(quote('Europe/London','2026-03-29T01:30:00Z').totalEur,2,'after the spring clock jump');
assert.equal(quote('Europe/London','2026-10-25T23:30:00Z',60).totalEur,2,'overnight tariff persists across local midnight');
const midnight=quote('Europe/London','2026-10-25T21:30:00Z',90);
assert.equal(midnight.complete,true);
assert.equal(midnight.totalEur,4,'energy is split across the London 22:00 boundary');
assert.equal(midnight.segmented,true);
assert.equal(quote(null,'2026-10-25T00:30:00Z').reason,'missing_tariff_time_zone');
assert.equal(quote('Bogus/Zone','2026-10-25T00:30:00Z').reason,'invalid_tariff_time_zone');
const allDay=pricing.evaluateOffer({pricing:{type:'rules',rules:[{scope:'allDay',pricePerKwh:.3}]}},{energyKwh:10});
assert.equal(allDay.complete,true,'an all-day price does not need a local time zone');
console.log('V9 pricing time zones, DST and midnight: pass');
