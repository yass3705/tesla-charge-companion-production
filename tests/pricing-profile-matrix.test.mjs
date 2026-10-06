import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const root=path.resolve(process.argv[2]||'dist/v9-explicit-candidate/runtime');
const engine=require(path.join(root,'assets/v9/session-engine.js'));
const pricing=require(path.join(root,'assets/v9/pricing-engine.js'));
const fr=JSON.parse(fs.readFileSync(path.join(root,'data/v9/france-direct-offers.json'),'utf8'));
const tesla=JSON.parse(fs.readFileSync(path.join(root,'data/tesla_stations.json'),'utf8'));
const offers=[...(fr.directOffers||[]),...(fr.subscriptionOffers||[])];
const exact=id=>{const offer=offers.find(row=>row.id===id);assert.ok(offer,id+' missing');return offer};
const evaluate=(offer,startAt,durationMinutes,postChargeMinutes=0,other={})=>engine.evaluateCompactMinuteOffer(offer,{startAt,durationMinutes,postChargeMinutes,energyKwh:10,...other});

const plenitude=exact('plenitude-ac-up-to-22');
assert.equal(evaluate(plenitude,'2026-10-06T12:00:00Z',150,90).totalEur,8.1,'Plenitude daytime post-charge fee');
assert.equal(evaluate(plenitude,'2026-10-06T21:00:00Z',150,90).totalEur,4.5,'Plenitude nighttime post-charge exemption');

const sigeif=exact('sigeif-7-22');
assert.equal(evaluate(sigeif,'2026-10-06T10:00:00Z',300).totalEur,9.9,'SIGEIF daytime after-threshold fee');
assert.equal(evaluate(sigeif,'2026-10-06T17:00:00Z',300).totalEur,7.9,'SIGEIF nighttime surcharge cap');

const stations=Array.isArray(tesla)?tesla:tesla.stations||[];
const agadir=stations.find(row=>row.id==='tesla-agadir-morocco');
assert.ok(agadir?.pricing,'Tesla Agadir power tariff missing');
const powerOffer={id:'tesla-agadir-morocco',provider:'Tesla',currency:'MAD',pricing:agadir.pricing};
const powerSession={startAt:'2026-10-06T12:00:00Z',durationMinutes:60,energyKwh:85,chargeTimeline:[
  {offsetMinutes:0,durationMinutes:30,energyKwh:25,powerKw:50},
  {offsetMinutes:30,durationMinutes:30,energyKwh:60,powerKw:120}
]};
assert.equal(engine.evaluateCompactMinuteOffer(powerOffer,powerSession).totalEur,138,'Tesla power bands must use actual power over time');
assert.equal(engine.evaluateCompactMinuteOffer(powerOffer,{...powerSession,chargeTimeline:[]}).reason,'power_band_requires_charge_power','Tesla power band needs measured or simulated power');
const reve=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,'data/v9/spain-reve-offers/offers_40_-7.json.gz'))).toString('utf8'));
const reveOffer=(reve.directOffers||[]).find(row=>row.id==='es:reve:direct:3d0ef19c-3788-416d-92e9-bda81a9c5154');
assert.ok(reveOffer,'Pinned REVE power-and-time profile missing');
const reveTotal=(powerKw,startAt)=>pricing.evaluateOffer(reveOffer,{startAt,energyKwh:10,durationMinutes:60,powerKw,timeZone:'Europe/Madrid'});
assert.equal(reveTotal(22,'2026-10-06T00:00:00Z').totalEur,3,'REVE 22 kW night band');
assert.equal(reveTotal(100,'2026-10-06T00:00:00Z').totalEur,3.8,'REVE 100 kW night band');
assert.equal(reveTotal(22,'2026-10-06T08:00:00Z').totalEur,3.5,'REVE 22 kW day band');
const parkedOffer={id:'reve-parking-probe',currency:'EUR',pricing:{type:'component_groups',componentGroups:[
  {kind:'ENERGY',rules:[{pricePerKwh:0.4}]},
  {kind:'PARKING_TIME',rules:[{connectedTimePerMinuteEur:0.05}]}
]}};
const parked=pricing.evaluateOffer(parkedOffer,{startAt:'2026-10-06T08:00:00Z',energyKwh:10,durationMinutes:60,chargingMinutes:50,postChargeMinutes:10,timeZone:'Europe/Madrid'});
assert.equal(parked.totalEur,4.5,'REVE parking fee applies to parked minutes only');
const tieredOffer={id:'reve-parking-tier-probe',currency:'EUR',pricing:{type:'component_groups',componentGroups:[
  {kind:'ENERGY',rules:[{pricePerKwh:0.4}]},
  {kind:'PARKING_TIME',rules:[
    {maxDurationMinutes:30,connectedTimePerMinuteEur:0},
    {minDurationMinutes:30,connectedTimePerMinuteEur:0.05}
  ]}
]}};
const tiered=pricing.evaluateOffer(tieredOffer,{startAt:'2026-10-06T08:00:00Z',energyKwh:10,durationMinutes:100,chargingMinutes:60,postChargeMinutes:40,timeZone:'Europe/Madrid'});
assert.equal(tiered.totalEur,4.5,'REVE parking fee applies only after the free 30 minutes');
const congestionOffer={id:'reve-congestion-probe',currency:'EUR',pricing:{type:'component_groups',componentGroups:[
  {kind:'ENERGY',rules:[{pricePerKwh:0.4}]},
  {kind:'CONGESTION_TIME',rules:[{minVehicleSoc:80,minCongestionPct:85,connectedTimePerMinuteEur:0.6}]}
]}};
assert.equal(pricing.evaluateOffer(congestionOffer,{startAt:'2026-10-06T08:00:00Z',energyKwh:10,durationMinutes:60,vehicleSoc:90,congestionPct:90,timeZone:'Europe/Madrid'}).reason,'congestion_timeline_required','Unknown congestion duration cannot produce a partial total');
console.log('Plenitude, SIGEIF, Tesla and REVE profile calculations OK');
