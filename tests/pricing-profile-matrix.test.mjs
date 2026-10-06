import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const root=path.resolve(process.argv[2]||'dist/v9-explicit-candidate/runtime');
const engine=require(path.join(root,'assets/v9/session-engine.js'));
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
console.log('Plenitude post-charge, SIGEIF night cap and Tesla power-band tariffs OK');
