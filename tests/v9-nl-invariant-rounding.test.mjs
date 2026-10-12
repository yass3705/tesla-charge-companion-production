import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const engine=require('../runtime-overrides/assets/v9/pricing-engine.js');
const DAYS=[0,1,2,3,4,5,6];
const base={
  startAt:'2026-10-12T23:30:00+02:00',timeZone:'Europe/Amsterdam',
  energyKwh:10,durationMinutes:61,chargingMinutes:61,postChargeMinutes:0,powerKw:22
};
function onlyRule(extra={}){
  return {id:'NL-single-whole-day',currency:'EUR',
    pricing:{type:'rules',timeZone:'Europe/Amsterdam',rules:[{
      scope:'timeWindow',start:'00:00',end:'24:00',days:DAYS,
      pricePerKwh:.3,chargePerMinute:.03,chargingTimeStepSeconds:900,
      connectionFee:.5,...extra
    }]}};
}
const evaluate=(offer,session=base)=>engine.evaluateOffer(offer,session);
const near=(actual,want,label)=>assert.ok(Math.abs(actual-want)<1e-6,
  label+': expected '+want+', got '+actual);

// At 23:30 a 61-minute charge crosses local midnight. The sole charge
// contract remains unchanged; 61 minutes billed in five 15-minute blocks
// must be rounded ONCE and the fixed fee must be included ONCE.
{
  const offer=onlyRule();
  const cross=evaluate(offer);
  assert.equal(cross.complete,true,JSON.stringify(cross));
  assert.equal(cross.components.segmentedPricing.wholeSessionSingleRule,true);
  near(cross.totalEur,10*.3+75*.03+.5,'whole-session TIME rounding');
  const daytime=evaluate(offer,{...base,startAt:'2026-10-12T12:00:00+02:00'});
  near(cross.totalEur,daytime.totalEur,'midnight vs ordinary unchanging price');
}
// Charge 1.2kWh with a paid one-kWh step: round to 2kWh for the session.
{
  const offer=onlyRule({chargePerMinute:0,chargingTimeStepSeconds:null,
                         energyStepWh:1000,pricePerKwh:.57});
  const cross=evaluate(offer,{...base,energyKwh:1.2});
  assert.equal(cross.complete,true,JSON.stringify(cross));
  near(cross.totalEur,2*.57+.5,'whole-session ENERGY rounding');
}
// Duration bands use the original 61-minute tariff duration, not each slice.
{
  const offer=onlyRule({chargePerMinute:0,chargingTimeStepSeconds:60,
                         ocpiDurationBands:[['TIME',3600,null,.4]]});
  const cross=evaluate(offer);
  assert.equal(cross.complete,true,JSON.stringify(cross));
  near(cross.totalEur,10*.3+61*.4+.5,'whole-session TIME band');
}
// The same charge and same unique whole-week rule stay valid across DST.
{
  const offer=onlyRule();
  const cross=evaluate(offer,{...base,startAt:'2026-10-25T00:30:00+02:00',
    durationMinutes:180,chargingMinutes:180,energyKwh:30});
  assert.equal(cross.complete,true,JSON.stringify(cross));
  near(cross.totalEur,30*.3+180*.03+.5,'DST invariant full session');
}
// Multiple rules might differ inside the period: remain fail-closed.
{
  const offer=onlyRule();
  offer.pricing.rules=[
    {scope:'timeWindow',start:'22:00',end:'24:00',days:DAYS,
      pricePerKwh:.3,chargePerMinute:.03,chargingTimeStepSeconds:900},
    {scope:'timeWindow',start:'00:00',end:'22:00',days:DAYS,
      pricePerKwh:.4,chargePerMinute:.03,chargingTimeStepSeconds:900}
  ];
  const cross=evaluate(offer);
  assert.equal(cross.complete,false);
  assert.equal(cross.reason,'tariff_window_crossing_unsupported_components');
}
// A single rule which only permits Monday cannot be extrapolated into Tuesday.
{
  const cross=evaluate(onlyRule({days:[1]}));
  assert.equal(cross.complete,false);
}
// Date, holiday and local same-day restrictions never invoke the shortcut.
for(const patch of [
  {validFromDate:'2026-10-12',validThroughDate:'2026-10-12'},
  {excludeHolidays:true},{holidayOnly:true},{mustEndSameLocalDay:true}
]){
  const result=evaluate(onlyRule(patch));
  assert.equal(result.complete,false,JSON.stringify({patch,result}));
}
console.log('NL invariant whole-session rounded rule protections: PASS');
