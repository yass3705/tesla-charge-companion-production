#!/usr/bin/env node
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url);
const mod=require(path.resolve(process.argv[2]||'runtime-overrides/assets/v9/pricing-engine.js'));
const r=(start,end,price)=>({scope:'timeWindow',start,end,currency:'GBP',pricePerKwh:price});
const offer={id:'pcpr-regression',kind:'direct',currency:'GBP',
  metadata:{timeZone:'Europe/London'},
  pricing:{type:'component_groups',ocpiFirstMatch:true,componentGroups:[
    {kind:'OCPI_ENERGY',rules:[r('00:00','24:00',0.50),r('00:00','24:00',0.90)]},
    {kind:'OCPI_TIME',rules:[{scope:'timeWindow',start:'00:00',end:'24:00',chargePerMinute:0.1}]}
  ]}
};
const result=mod.evaluateOffer(offer,{startAt:'2026-10-09T11:00:00Z',durationMinutes:10,chargingMinutes:10,energyKwh:1});
assert.equal(result.complete,true,JSON.stringify(result));
assert.ok(Math.abs(result.totalEur-1.5)<0.00001,'same OCPI energy dimension must never be double charged');
const changing={...offer,pricing:{type:'component_groups',ocpiFirstMatch:true,componentGroups:[
  {kind:'OCPI_ENERGY',rules:[r('11:00','12:00',0.5),r('12:00','13:00',0.9)]}
]}};
const cross=mod.evaluateOffer(changing,{startAt:'2026-12-09T11:30:00Z',durationMinutes:60,chargingMinutes:60,energyKwh:10});
assert.equal(cross.complete,true,JSON.stringify(cross));
assert.ok(Math.abs(cross.totalEur-7)<0.00001,'price switch should allocate equal energy by charging time');
const rounded={...changing,pricing:{...changing.pricing,componentGroups:[
  {kind:'OCPI_ENERGY',rules:[{...r('11:00','12:00',0.5),energyStepWh:1},{...r('12:00','13:00',0.9),energyStepWh:1}]}
]}};
const guarded=mod.evaluateOffer(rounded,{startAt:'2026-12-09T11:30:00Z',durationMinutes:60,chargingMinutes:60,energyKwh:10});
assert.equal(guarded.complete,false,'unknown rounding across tariff change must fail closed');
const normal={...offer,pricing:{...offer.pricing,ocpiFirstMatch:false}};
const other=mod.evaluateOffer(normal,{startAt:'2026-10-09T11:00:00Z',durationMinutes:10,chargingMinutes:10,energyKwh:1});
assert.equal(other.complete,false,'legacy ambiguous overlapping tariffs should remain fail closed');
console.log(JSON.stringify({ok:true,firstMatch:result.totalEur,segmented:cross.totalEur,roundingGuard:guarded.reason,otherPricingUnchanged:other.reason}));
