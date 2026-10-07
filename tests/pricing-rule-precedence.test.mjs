import assert from 'node:assert/strict';
import path from 'node:path';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const root=path.resolve(process.argv[2]||'dist/v9-explicit-candidate/runtime');
const pricing=require(path.join(root,'assets/v9/pricing-engine.js'));
const session=require(path.join(root,'assets/v9/session-engine.js'));
const offer={
  id:'profile-window-probe',provider:'Profile audit',currency:'EUR',
  pricing:{type:'rules',rules:[
    {scope:'allDay',start:'00:00',end:'24:00',pricePerKwh:0.4},
    {scope:'timeWindow',start:'08:00',end:'18:00',days:[1,2,3,4,5],pricePerKwh:0.5}
  ]}
};
const base={energyKwh:10,durationMinutes:60,timeZone:'Europe/Paris'};
const total=(startAt,durationMinutes=60)=>pricing.evaluateOffer(offer,{...base,startAt,durationMinutes});
assert.equal(total('2026-10-06T12:00:00Z').totalEur,5,'weekday time window should outrank all-day fallback');
assert.equal(total('2026-10-10T12:00:00Z').totalEur,4,'weekday rule must not apply on Saturday');
assert.equal(total('2026-10-06T05:30:00Z').totalEur,4.5,'fallback-to-window crossing must split energy');
const direct=session.evaluateCompactMinuteOffer({
  id:'mixed-window-probe',provider:'Electra',currency:'EUR',
  pricing:{type:'rules',rules:[
    {scope:'allDay',start:'00:00',end:'24:00',pricePerKwh:0.4,connectionFee:0.5},
    {scope:'timeWindow',start:'08:00',end:'18:00',days:[1,2,3,4,5],pricePerKwh:0.5,connectionFee:0.5}
  ]}
},{...base,startAt:'2026-10-06T05:30:00Z'});
assert.equal(direct?.complete,true);
assert.equal(direct.totalEur,5,'mixed fallback-to-window crossing must add the connection fee once');
console.log('Time-window precedence, weekday restrictions and fallback segmentation OK');
