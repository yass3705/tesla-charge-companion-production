import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const pricing=require('../runtime-overrides/assets/v9/pricing-engine.js');
const adapter=require('../runtime-overrides/assets/v9/adapters/netherlands-dotnl.js');
const DAYS=[0,1,2,3,4,5,6];
const raw=(start,end,kwh,perMinute,fee=0,steps={})=>[
  'timeWindow',start,end,'kwh','EUR',kwh,perMinute,fee,0,0,0,DAYS,[],steps
];
const offer=rows=>{
  const station=adapter.normalizeRow(['NL:LNT:rounding','Safe rounding','NL',52,5,'LNT',1,null,
    [['LNT-test','Type2','AC',22,1,rows]],'2026-10-11T10:32:38Z','IN_SERVICE']);
  assert.equal(station.offers.length,1,'exact per-connector offer retained');
  return station.offers[0];
};
const session={
  startAt:'2026-10-12T23:30:00+02:00',timeZone:'Europe/Amsterdam',
  energyKwh:10,durationMinutes:60,chargingMinutes:60,postChargeMinutes:0,powerKw:22
};
const near=(actual,want,label)=>assert.ok(Math.abs(actual-want)<1e-6,`${label}: ${actual} != ${want}`);
const evaluate=o=>pricing.evaluateOffer(o,session);

// A present TIME step of 60 seconds carries no monetary effect when TIME costs 0.
// The midnight energy price changes; the one-time FLAT fee must appear only once.
{
  const o=offer([
    raw('00:00','24:00',.4,0,.5,{chargingTimeStepSeconds:60}),
    raw('22:00','24:00',.2,0,.5,{chargingTimeStepSeconds:60})
  ]);
  const result=evaluate(o);
  assert.equal(result.complete,true,JSON.stringify(result));
  assert.equal(result.segmented,true,'explicit midnight boundary was crossed');
  near(result.totalEur,10*.2+.5,'whole-session price at 23:30');
}
// Explicit two successive windows with zero-priced TIME rounding must segment,
// including a midnight change in ENERGY without duplicating FLAT.
{
  const o=offer([
    raw('22:00','24:00',.2,0,.5,{chargingTimeStepSeconds:60}),
    raw('00:00','22:00',.4,0,.5,{chargingTimeStepSeconds:60})
  ]);
  const result=evaluate(o);
  assert.equal(result.complete,true,JSON.stringify(result));
  assert.equal(result.segmented,true);
  near(result.totalEur,5*.2+5*.4+.5,'price and fixed fee across midnight');
}
// A nonzero price on TIME still blocks: per-segment ceil(60s) is not
// necessarily equivalent to whole-session ceil(60s).
{
  const o=offer([
    raw('22:00','24:00',.2,.07,.5,{chargingTimeStepSeconds:900}),
    raw('00:00','22:00',.4,.07,.5,{chargingTimeStepSeconds:900})
  ]);
  const result=evaluate(o);
  assert.equal(result.complete,false);
  assert.equal(result.reason,'tariff_window_crossing_unsupported_components');
}
// Likewise an ENERGY rounding step with nonzero energy price is protected.
{
  const o=offer([
    raw('22:00','24:00',.2,0,.5,{energyStepWh:1000}),
    raw('00:00','22:00',.4,0,.5,{energyStepWh:1000})
  ]);
  const result=evaluate(o);
  assert.equal(result.complete,false);
  assert.equal(result.reason,'tariff_window_crossing_unsupported_components');
}
// An ENERGY step when ENERGY is free (but FLAT is charged) is inert.
// No free price is fabricated and the FLAT remains one-time only.
{
  const o=offer([
    raw('22:00','24:00',0,0,.5,{energyStepWh:1000}),
    raw('00:00','22:00',0,0,.5,{energyStepWh:1000})
  ]);
  const result=evaluate(o);
  assert.equal(result.complete,true,JSON.stringify(result));
  near(result.totalEur,.5,'flat-only session');
}
// A nominal zero-rate with a billable OCPI TIME band must STILL block.
{
  const band=[['TIME',0,null,.05]];
  const o={id:'NL-restricted',currency:'EUR',pricing:{
    type:'rules',timeZone:'Europe/Amsterdam',rules:[
      {scope:'timeWindow',start:'22:00',end:'24:00',pricePerKwh:.2,
       chargePerMinute:0,chargingTimeStepSeconds:60,ocpiDurationBands:band,days:DAYS},
      {scope:'timeWindow',start:'00:00',end:'22:00',pricePerKwh:.4,
       chargePerMinute:0,chargingTimeStepSeconds:60,ocpiDurationBands:band,days:DAYS}
    ]}};
  const result=evaluate(o);
  assert.equal(result.complete,false,JSON.stringify(result));
  assert.equal(result.reason,'tariff_window_crossing_unsupported_components');
}
{
  const band=[['ENERGY',0,null,.5]];
  const o={id:'NL-band',currency:'EUR',pricing:{
    type:'rules',timeZone:'Europe/Amsterdam',rules:[
      {scope:'timeWindow',start:'22:00',end:'24:00',pricePerKwh:0,
       energyStepWh:1000,ocpiDurationBands:band,days:DAYS},
      {scope:'timeWindow',start:'00:00',end:'22:00',pricePerKwh:0,
       energyStepWh:1000,ocpiDurationBands:band,days:DAYS}
    ]}};
  const result=evaluate(o);
  assert.equal(result.complete,false,JSON.stringify(result));
  assert.equal(result.reason,'tariff_window_crossing_unsupported_components');
}
// No additional relaxation of actually billed connected-time steps, flat
// duration tiers, holiday conditions, or nonzero rounded charging fees.
{
  const o={id:'NL-connected',currency:'EUR',pricing:{type:'rules',
    timeZone:'Europe/Amsterdam',rules:[
      {scope:'timeWindow',start:'22:00',end:'24:00',pricePerKwh:.2,pricePerMinute:.01,connectedTimeStepSeconds:60,days:DAYS},
      {scope:'timeWindow',start:'00:00',end:'22:00',pricePerKwh:.4,pricePerMinute:.01,connectedTimeStepSeconds:60,days:DAYS}
    ]}};
  assert.equal(evaluate(o).reason,'tariff_window_crossing_unsupported_components');
}
console.log('V9 zero-priced OCPI step midnight guards: PASS');
