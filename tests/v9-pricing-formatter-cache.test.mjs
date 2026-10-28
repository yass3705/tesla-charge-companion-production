import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
let constructions=0;
function DateTimeFormat(...args){constructions++;return new Intl.DateTimeFormat(...args);}
const context={Intl:{DateTimeFormat}};
runInNewContext(readFileSync(new URL('../runtime-overrides/assets/v9/pricing-engine.js',import.meta.url),'utf8'),context);
const pricing=context.TCCV9PricingEngine;
const offer={id:'fixture',currency:'EUR',pricing:{type:'rules',timeZone:'Europe/Amsterdam',rules:[{scope:'allDay',start:'00:00',end:'24:00',pricePerKwh:.4}]}};
for(let i=0;i<100;i++){
 const quote=pricing.evaluateOffer(offer,{startAt:'2026-10-25T01:30:00Z',energyKwh:i,durationMinutes:30,chargingMinutes:30});
 assert.equal(quote.complete,true);assert.equal(quote.totalEur,Math.round(i*.4*1e6)/1e6,'each session amount is still evaluated independently');
}
assert.ok(constructions<=3,`formatters should be reused, got ${constructions}`);
const first=pricing.minuteOfDay('2026-10-25T00:30:00Z','Europe/Amsterdam');
const second=pricing.minuteOfDay('2026-10-25T01:30:00Z','Europe/Amsterdam');
assert.equal(first,150,'summer-side DST clock is 02:30');
assert.equal(second,150,'winter-side DST clock is also 02:30');
assert.equal(pricing.minuteOfDay('2026-10-25T01:30:00Z','Europe/London'),90,
  'a different time zone does not reuse Amsterdam clock time');
assert.equal(pricing.minuteOfDay('2026-10-25T01:31:00Z','Europe/Amsterdam'),151,
  'a changed session instant does not reuse its prior local minute');
const invalid=pricing.evaluateOffer({...offer,pricing:{...offer.pricing,timeZone:'Invalid/Zone'}},{energyKwh:10});
assert.equal(invalid.complete,false,'invalid zones must still fail closed');
console.log('Pricing formatter cache: independent amounts, bounded construction, invalid-zone guard PASS');
