import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const root=path.resolve(process.argv[2]||'dist/v9-explicit-candidate');
const runtime=path.join(root,'runtime');
const engine=require(path.join(runtime,'assets/v9/session-engine.js'));
const payload=JSON.parse(fs.readFileSync(path.join(root,'snapshot-inputs/FR/platforms/electroverse-runtime-offers.json'),'utf8'));
const stats=payload.metadata;
assert.ok(stats.publishedStationOffers>=stats.inputCachedStations*0.9,'most validated Electroverse stations should receive a tariff');
assert.ok(stats.publishedOffers>=stats.publishedStationOffers);
assert.equal(Object.values(stats.nationalJoin).reduce((a,b)=>a+b,0),stats.publishedOffers);
assert.ok(stats.nationalJoin.bridgedNationalId>0);
assert.ok(!stats.rejected.complex_pricing,'complex tariffs should be parsed, not blanket-rejected');
assert.ok(payload.emspOffers.some(o=>o.pricing.rules.some(r=>r.types.includes('DURATION_BASED'))));
assert.ok(payload.emspOffers.some(o=>o.pricing.rules.some(r=>r.types.includes('TIME_BASED'))));
assert.ok(payload.emspOffers.some(o=>o.pricing.rules.some(r=>r.types.includes('DATE_BASED'))));

const rates=(values={})=>({energy:0,chargingMinute:0,parkingMinute:0,flat:0,...values});
const rule=(types,values,extras={})=>({types,rates:rates(values),components:['energy','chargingMinute','parkingMinute','flat'],...extras});
const offer=rules=>({id:'electroverse:fixture',provider:'Electroverse',currency:'EUR',pricing:{type:'electroverse_restrictions',version:1,fallbackRates:rates(),rules},metadata:{timeZone:'Europe/Paris'}});
const estimate=(o,session)=>engine.evaluateElectroverseOffer(o,session);
const session=(startAt,durationMinutes,chargingMinutes,energyKwh)=>({startAt,durationMinutes,chargingMinutes,energyKwh});

const dayNight=offer([
  rule(['TIME_BASED'],{energy:0.4,chargingMinute:0.1},{startTime:'08:00',endTime:'20:00'}),
  rule([],{energy:0.4,chargingMinute:0.05,flat:2})
]);
assert.equal(estimate(dayNight,session('2026-10-06T17:30:00Z',60,45,20)).totalEur,11.75);
const duration=offer([
  rule(['DURATION_BASED'],{energy:0.3,chargingMinute:0.2},{minDurationSeconds:3600,maxDurationSeconds:null}),
  rule([],{energy:0.3,chargingMinute:0.1})
]);
assert.equal(estimate(duration,session('2026-10-06T10:00:00Z',90,90,18)).totalEur,17.4);
assert.equal(estimate(offer([rule([],{energy:0.3,chargingMinute:0.05,parkingMinute:0.2,flat:1})]),session('2026-10-06T10:00:00Z',90,60,20)).totalEur,16);

const split=offer([
  rule([],{energy:0.3,flat:1},{components:['energy','flat']}),
  rule(['DURATION_BASED'],{chargingMinute:0.02},{components:['chargingMinute'],minDurationSeconds:0,maxDurationSeconds:7200}),
  rule(['DURATION_BASED'],{chargingMinute:0.07},{components:['chargingMinute'],minDurationSeconds:7200,maxDurationSeconds:null})
]);
assert.equal(estimate(split,session('2026-10-06T10:00:00Z',150,150,30)).totalEur,14.5);
const date=offer([
  rule(['DATE_BASED'],{energy:0.5},{startDate:'2026-01-01',endDate:'2026-10-06'}),
  rule(['DATE_BASED'],{energy:0.6},{startDate:'2026-10-06',endDate:null})
]);
assert.equal(estimate(date,session('2026-10-06T10:00:00Z',30,30,10)).totalEur,6);
const ambiguous=offer([
  rule(['TIME_BASED'],{energy:0.3},{startTime:'08:00',endTime:'20:00'}),
  rule(['TIME_BASED'],{energy:0.4},{startTime:'08:00',endTime:'20:00'})
]);
assert.equal(estimate(ambiguous,session('2026-10-06T10:00:00Z',60,60,10)).reason,'ambiguous_electroverse_restriction');

const complex=payload.emspOffers.filter(o=>o.pricing.rules.some(r=>r.types.length));
const sample=complex.filter((_,i)=>i%Math.max(1,Math.floor(complex.length/300))===0).slice(0,300);
const complete=sample.filter(o=>estimate(o,session('2026-10-06T10:00:00Z',90,75,25)).complete).length;
assert.ok(complete>=sample.length*0.9,`only ${complete}/${sample.length} sampled real complex offers could be evaluated`);
console.log(`Electroverse complex tariffs OK: ${stats.publishedStationOffers}/${stats.inputCachedStations} stations, ${stats.publishedOffers} offers, ${complete}/${sample.length} sampled sessions`);
