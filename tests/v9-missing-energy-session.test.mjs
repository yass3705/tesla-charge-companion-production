import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const context={TCCV9OfferEngine:require('../runtime-owned/assets/v9/offer-engine.js'),
  TCCV9PricingEngine:require('../runtime-overrides/assets/v9/pricing-engine.js')};
runInNewContext(readFileSync(new URL('../runtime-overrides/assets/v9/session-engine.js',import.meta.url),'utf8'),context);
const sessions=context.TCCV9SessionEngine;
const station={id:'FR:missing-energy',countryCode:'FR',evses:[{id:'evse',connectors:[
  {id:'plug',kind:'DC',powerKw:50}]}],offers:[{id:'energy-offer',provider:'Source',kind:'direct',
  currency:'EUR',pricing:{type:'rules',rules:[{scope:'allDay',pricePerKwh:.4}]}}]};
for(const missing of [undefined,null,'']){
  const session={startAt:'2026-10-28T12:00:00Z',durationMinutes:30,chargingMinutes:30,
    energyKwh:missing,approachEnergyKwhByStationId:{'FR:missing-energy':2}};
  const effective=sessions.stationSession(station,session);
  assert.equal(effective.energyKwh,null,'route energy cannot fill a missing charge amount');
  const result=sessions.evaluateStation(station,session,{targetCurrency:'EUR'});
  assert.equal(result.best,null,'missing energy cannot be ranked as a zero-cost session');
  assert.equal(result.incomplete[0].result.reason,'energy_required');
}
const known=sessions.evaluateStation(station,{startAt:'2026-10-28T12:00:00Z',
  durationMinutes:30,chargingMinutes:30,energyKwh:10},{targetCurrency:'EUR'});
assert.equal(known.best?.total,4,'known energy still uses the documented rate');
console.log('V9 missing energy stays incalculable; known energy remains priced PASS');
