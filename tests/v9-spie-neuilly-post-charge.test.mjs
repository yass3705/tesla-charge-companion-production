#!/usr/bin/env node
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const pricing=require('../runtime-overrides/assets/v9/pricing-engine.js');

const offer={id:'metropolis-neuilly',currency:'EUR',pricing:{
  type:'rules',timeZone:'Europe/Paris',
  rules:[{scope:'allDay',pricePerKwh:0.53,energyRounding:'started_kwh'}],
  postChargeFee:{graceMinutes:10,localRateWindows:[
    {start:'08:00',end:'20:00',eurPerMinute:0.2},
    {start:'20:00',end:'08:00',eurPerMinute:0.1}
  ]}
}};
const quote=(start,minutes,extra={})=>pricing.evaluateOffer(offer,{
  startAt:start,chargingMinutes:0,durationMinutes:0,energyKwh:0,
  postChargeStartAt:start,postChargeMinutes:minutes,...extra
});

assert.equal(quote('2026-10-13T17:45:00Z',10).totalEur,0,'10-minute grace is free');
assert.equal(quote('2026-10-13T17:45:00Z',20).totalEur,1.5,
  '19:55–20:05 Paris uses five daytime and five nighttime minutes');
assert.equal(quote('2026-10-13T08:00:00Z',11.2).totalEur,0.4,
  'fractional second billable minute is charged as started');
assert.equal(quote('2026-10-25T00:50:00Z',80).totalEur,7,
  'autumn DST change preserves the actual 70 nighttime billable minutes');
assert.equal(quote('2026-10-13T17:45:00Z',20,{postChargeStartAt:null}).totalEur,1.5,
  'known session start and charging duration derive charge-end instant');

const missing=quote('2026-10-13T17:45:00Z',20,{postChargeStartAt:null,startAt:null,chargingMinutes:null});
assert.equal(missing.complete,false,'unknown end-of-charge time cannot enter priced ranking');
const boundary=quote('2026-10-13T17:49:30Z',12);
assert.equal(boundary.complete,false,'started minute spanning 20:00 needs supplier rounding proof');
const overlap=structuredClone(offer);
overlap.pricing.postChargeFee.localRateWindows.push({start:'19:00',end:'21:00',eurPerMinute:0.2});
assert.equal(pricing.evaluateOffer(overlap,{startAt:'2026-10-13T17:45:00Z',chargingMinutes:0,
  durationMinutes:0,energyKwh:0,postChargeMinutes:20}).complete,false,
  'overlapping rate windows cannot produce a price');
const noZone=structuredClone(offer);
delete noZone.pricing.timeZone;
assert.equal(pricing.evaluateOffer(noZone,{startAt:'2026-10-13T17:45:00Z',chargingMinutes:0,
  durationMinutes:0,energyKwh:0,postChargeMinutes:20}).complete,false,
  'local-rate windows without a proven time zone cannot use the host time zone');
console.log('Métropolis Neuilly time-window post-charge oracle: pass');
