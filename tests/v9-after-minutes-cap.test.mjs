import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import path from 'node:path';
const require=createRequire(import.meta.url);
const context={};
runInNewContext(readFileSync('runtime-overrides/assets/v9/pricing-engine.js','utf8'),context);
const pricing=process.argv[2]?require(path.resolve(process.argv[2],'runtime/assets/v9/pricing-engine.js')):context.TCCV9PricingEngine;
const shell=require('../v9-production-shell/bridge.js');
// Synthetic sessions repeat the archived 11 October after-minutes oracle.
// They are not supplier offers and are never inserted into candidate data.
const base={scope:'allDay',pricePerKwh:.4,afterMinutesRate:.3,afterMinutesThreshold:60,afterMinutesComponent:'CONNECTED_TIME'};
const session={energyKwh:25,durationMinutes:90,chargingMinutes:75,postChargeMinutes:15,startAt:'2026-10-11T13:00:00+02:00'};
const quote=(rule={},s={},extra={})=>pricing.evaluateOffer({id:'fixture',currency:'EUR',metadata:{timeZone:'Europe/Paris'},pricing:{type:'rules',rules:[{...base,...rule}]},...extra},{...session,...s});
const total=(result,expected)=>{assert.equal(result.complete,true,JSON.stringify(result));assert.equal(result.totalEur,expected);};
total(quote(),19);
total(quote({}, {durationMinutes:60,chargingMinutes:60,postChargeMinutes:0}),10);
total(quote({afterMinutesComponent:'TIME'}),14.5);
total(quote({afterMinutesComponent:'PARKING_TIME'}),14.5);
assert.equal(quote({afterMinutesComponent:undefined}).reason,'after_minutes_component_unverified');
assert.equal(quote({afterMinutesCap:-4}).reason,'after_minutes_invalid_cap_value');
assert.equal(quote({afterMinutesThreshold:-1}).reason,'invalid_after_minutes_threshold');
assert.equal(quote({}, {durationMinutes:undefined}).reason,'duration_required');
assert.equal(quote({afterMinutesComponent:'TIME'}, {chargingMinutes:undefined}).reason,'charging_duration_required');
assert.equal(quote({afterMinutesComponent:'PARKING_TIME'}, {postChargeMinutes:undefined}).reason,'post_charge_duration_required');
total(quote({afterMinutesCap:4,afterMinutesCapMode:'whole_session'}),14);
total(quote({afterMinutesCap:4,afterMinutesCapMode:'whole_session',minimumSessionEur:20}),20);
const night={afterMinutesRate:.05,afterMinutesThreshold:180,afterMinutesCap:4,
 afterMinutesCapMode:'night_window_local_per_night',afterMinutesCapStart:'20:00',afterMinutesCapEnd:'08:00'};
total(quote(night,{startAt:'2026-10-11T20:30:00+02:00',durationMinutes:300,chargingMinutes:300,postChargeMinutes:0}),14);
// 16:00 + three-hour grace: 19:00–20:00 costs 3 EUR, night portion caps at 4 EUR.
total(quote(night,{startAt:'2026-10-11T16:00:00+02:00',durationMinutes:600,chargingMinutes:600,postChargeMinutes:0}),17);
assert.equal(quote({...night,afterMinutesCapMode:undefined}).reason,'after_minutes_cap_window_requires_source_confirmation');
assert.equal(quote(night,{}, {currency:'GBP'}).reason,'after_minutes_cap_currency_unverified');
const capped=quote(night,{startAt:'2026-10-11T20:30:00+02:00',durationMinutes:300,chargingMinutes:300,postChargeMinutes:0});
assert.equal(shell.feeBreakdown(capped.components).find(r=>r.key==='afterMinutes')?.amount,4);
assert.equal(shell.feeBreakdown(capped.components).reduce((n,r)=>n+r.amount,0),14);
// Repeated local hour on the DST transition belongs to the same capped night.
total(quote({...night,afterMinutesThreshold:0},{startAt:'2026-10-25T00:30:00+02:00',durationMinutes:540,chargingMinutes:540,postChargeMinutes:0}),15.5);
console.log('After-minutes phases, thresholds, whole/night caps, DST, minimum and visible fees PASS');

total(quote({...night,afterMinutesThreshold:0},{startAt:'2026-10-11T20:00:00+02:00',durationMinutes:1500,chargingMinutes:1500,postChargeMinutes:0}),53);
const segmented={id:'segmented-fixture',currency:'EUR',metadata:{timeZone:'Europe/Paris'},pricing:{type:'rules',rules:[
 {...base,scope:'timeWindow',start:'08:00',end:'20:00'},
 {...base,scope:'timeWindow',start:'20:00',end:'08:00'}]}};
total(pricing.evaluateOffer(segmented,{...session,startAt:'2026-10-11T19:30:00+02:00',chargingMinutes:90,postChargeMinutes:0}),19);
console.log('Per-night cap reset and no repeated grace at tariff boundaries PASS');

// Do not round a half-minute on the daytime/night boundary into the capped night.
total(quote({...night,afterMinutesThreshold:0},{startAt:'2026-10-11T19:59:30+02:00',durationMinutes:180,chargingMinutes:180,postChargeMinutes:0}),14.025);

// The session-start fast path must retain the same guards and cap calculation.
for(const module of ['runtime-owned/assets/v9/offer-engine.js','runtime-overrides/assets/v9/session-engine.js'])
 runInNewContext(readFileSync(module,'utf8'),context);
const sessionEngine=process.argv[2]?require(path.resolve(process.argv[2],'runtime/assets/v9/session-engine.js')):context.TCCV9SessionEngine;
const lockedOffer={id:'locked-fixture',currency:'EUR',metadata:{timeZone:'Europe/Paris'},pricing:{type:'rules',priceSelectionBasis:'session_start_local_time',rules:[{...base,afterMinutesCap:4,afterMinutesCapMode:'whole_session'}]}};
const station={id:'fixture',countryCode:'FR',evses:[{id:'evse',connectors:[{id:'plug',kind:'AC',powerKw:22}]}],offers:[lockedOffer]};
assert.equal(sessionEngine.evaluateStation(station,session).best.total,14);
lockedOffer.pricing.rules[0].afterMinutesComponent=undefined;
const incomplete=sessionEngine.evaluateStation(station,session);
assert.equal(incomplete.comparableOfferCount,0);
assert.equal(incomplete.incomplete[0].result.reason,'after_minutes_component_unverified');
console.log('Session-start path cannot bypass unverified fee guards PASS');
