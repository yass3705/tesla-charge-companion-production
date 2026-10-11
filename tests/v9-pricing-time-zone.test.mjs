import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const require=createRequire(import.meta.url);
const pricing=require('../runtime-overrides/assets/v9/pricing-engine.js');
const context={TCCV9OfferEngine:{eligibleOffers:station=>station.offers||[]},TCCV9PricingEngine:pricing};
runInNewContext(readFileSync(new URL('../runtime-overrides/assets/v9/session-engine.js',import.meta.url),'utf8'),context);
const sessions=context.TCCV9SessionEngine;

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
assert.equal(pricing.evaluateOffer(offer('Europe/London'),{startAt:'2026-03-29T01:30:00Z',timeZone:'America/New_York',energyKwh:5,durationMinutes:30}).totalEur,2,'source zone wins over the session at DST');
assert.equal(pricing.offerTimeZone({pricing:{timeZone:'Europe/London'},metadata:{timeZone:'Europe/Paris'}},{stationTimeZone:'UTC',timeZone:'America/New_York'}),'Europe/London');
assert.equal(pricing.offerTimeZone({metadata:{timeZone:'Europe/Paris'}},{stationTimeZone:'UTC',timeZone:'America/New_York'}),'Europe/Paris');
assert.equal(pricing.offerTimeZone({}, {stationTimeZone:'UTC',timeZone:'America/New_York'}),'UTC');
const localSession={startAt:'2026-10-26T00:30:00Z',timeZone:'America/New_York',energyKwh:10,durationMinutes:60,chargingMinutes:60};
const dated={...offer('Europe/London'),validFrom:'2026-10-26',validThrough:'2026-10-26'};
assert.equal(sessions.evaluateOfferValidity(dated,localSession).complete,true,'London date governs offer validity across midnight');
assert.equal(sessions.evaluateOfferValidity({...dated,pricing:{...dated.pricing,timeZone:'Bogus/Zone'}},localSession).complete,false,'invalid explicit zone must not fall back to the session');
const locked={...offer('Europe/London'),pricing:{...offer('Europe/London').pricing,priceSelectionBasis:'session_start_local_time'}};
assert.equal(sessions.evaluateSessionStartLockedOffer(locked,{...localSession,startAt:'2026-03-29T01:30:00Z'}).totalEur,4,'locked price uses London time after DST jump');
assert.equal(sessions.evaluateSessionStartLockedOffer({...locked,pricing:{...locked.pricing,timeZone:'Bogus/Zone'}},localSession).reason,'invalid_tariff_time_zone');
const timeline={...localSession,startAt:'2026-10-25T21:30:00Z',durationMinutes:90,chargingMinutes:90,chargeTimeline:[{offsetMinutes:0,durationMinutes:90,energyKwh:10,startSoc:20,endSoc:80,powerKw:50}]};
const timelineResult=sessions.evaluateTimelineOffer(offer('Europe/London'),timeline);
assert.equal(timelineResult?.complete,true);
assert.equal(timelineResult?.energyTimelineApplied,true);
assert.equal(timelineResult?.timeZone,'Europe/London');
assert.equal(timelineResult?.totalEur,2.666667,'energy timeline splits at the London overnight tariff boundary');
const station={id:'zone-station',timeZone:'Europe/London',evses:[{id:'evse',connectors:[{id:'plug',kind:'DC',powerKw:50}]}],offers:[{...offer(null),id:'station-zone'}]};
assert.equal(sessions.evaluateStation(station,{...localSession,startAt:'2026-03-29T01:30:00Z',targetCurrency:'GBP'}).best?.result?.timeZone,'Europe/London','station zone wins over session when source has none');
const allDay=pricing.evaluateOffer({pricing:{type:'rules',rules:[{scope:'allDay',pricePerKwh:.3}]}},{energyKwh:10});
assert.equal(allDay.complete,true,'an all-day price does not need a local time zone');
console.log('V9 pricing time zones, DST and midnight: pass');
