import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const root=path.resolve(process.argv[2]||'dist/v9-explicit-candidate/runtime');
const sessionEngine=require(path.join(root,'assets/v9/session-engine.js'));
const payload=JSON.parse(fs.readFileSync(path.join(root,'data/v9/france-direct-offers.json'),'utf8'));
const direct=payload.directOffers.find(offer=>offer.id==='fastned-app');
const member=payload.subscriptionOffers.find(offer=>offer.id==='fastned-gold');
assert.ok(direct&&member,'pinned Fastned membership and public rate must exist');
assert.equal(member.subscriptionId,'fastned-gold');

const station={id:'subscription-fastned-probe',countryCode:'FR',physicalOperator:{id:'fastned',name:'Fastned'},
  evses:[{id:'fastned-evse',connectors:[{id:'fastned-ccs',kind:'DC',plugName:'CCS',powerKw:150}]}],
  offers:[{...direct,kind:'direct'},{...member,kind:'subscription'}]};
const session={startAt:'2026-10-06T12:00:00Z',timeZone:'Europe/Paris',durationMinutes:30,chargingMinutes:30,
  energyKwh:10,requestedEnergyKwh:10,targetCurrency:'EUR',powerKw:150,
  chargeTimeline:[{offsetMinutes:0,durationMinutes:30,energyKwh:10,powerKw:150}]};
const without=sessionEngine.evaluateStation(station,session,{selectedSubscriptions:[],targetCurrency:'EUR'});
const withPlan=sessionEngine.evaluateStation(station,session,{selectedSubscriptions:['fastned-gold'],targetCurrency:'EUR'});
assert.equal(without.best.offerId,'fastned-app','unselected membership must not affect the price');
assert.equal(without.best.total,5.49);
assert.equal(withPlan.best.offerId,'fastned-gold','selected membership must enter the comparison');
assert.equal(withPlan.best.total,4.3);
assert.equal(withPlan.best.subscriptionId,'fastned-gold');
console.log('Pinned Fastned membership selection changes the calculated charge price');
