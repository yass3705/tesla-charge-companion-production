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

const planner=require('../runtime-owned/assets/v9/session-planner-engine.js');
const charge=require('../runtime-owned/assets/v9/charge-model-engine.js');
const full={startAt:'2026-11-05T12:00:00Z',batteryCapacityKwh:80,startSoc:20,targetSoc:80,
  consumptionKwhPer100Km:18,vehicleMaxDcKw:50};
for(const missing of [undefined,null,'']){
  for(const field of ['startSoc','targetSoc']){
    const input={...full,[field]:missing,energyKwh:null};
    const plan=planner.planStation(station,input);
    assert.equal(plan.requestedEnergyKwh,null,`${field} missing must not fabricate energy`);
    assert.equal(plan.deliveredEnergyKwh,null);
    assert.equal(plan.chargingMinutes,null);
    assert.deepEqual(plan.effectiveSession.chargeTimeline,[]);
    assert.equal(sessions.evaluateStation(station,plan.effectiveSession,{targetCurrency:'EUR'}).best,null);
  }
}
const complete=planner.planStation(station,full);
assert.equal(complete.deliveredEnergyKwh,48);
assert.equal(sessions.evaluateStation(station,complete.effectiveSession,{targetCurrency:'EUR'}).best.total,19.2);
const explicit=planner.planStation(station,{...full,startSoc:null,targetSoc:null,energyKwh:10});
assert.equal(explicit.arrivalSoc,null);
assert.equal(explicit.actualTargetSoc,null);
assert.equal(explicit.deliveredEnergyKwh,10,'explicit known energy is usable without fabricating a SOC');
assert.equal(sessions.evaluateStation(station,explicit.effectiveSession,{targetCurrency:'EUR'}).best.total,4);
const zero=planner.planStation(station,{...full,startSoc:0,targetSoc:80});
assert.equal(zero.arrivalSoc,0,'an explicitly known zero SOC is retained');
assert.equal(zero.deliveredEnergyKwh,64);
assert.deepEqual(charge.estimate(station,{...full,chargeEfficiency:null}),charge.estimate(station,full),
  'absent optional efficiency uses the documented default, not a fabricated 1 percent');
console.log('Explicit missing SOC/energy stays unavailable; known SOC and explicit energy preserved PASS');

const {executeV9}=require('../v9-production-shell/bridge.js');
for(const missing of [undefined,null,''])for(const field of ['startSoc','targetSoc']){
  await assert.rejects(executeV9({}, {}, {}, {...full,[field]:missing,originText:'test'}),/Renseignez les niveaux de batterie/);
}
