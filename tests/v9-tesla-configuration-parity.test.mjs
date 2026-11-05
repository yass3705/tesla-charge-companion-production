import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const adapter=require('../runtime-overrides/assets/v9/adapters/tesla-json.js');
const engine=require('../runtime-overrides/assets/v9/pricing-engine.js');
const file=process.argv[2];
const raw=JSON.parse(fs.readFileSync(file));
for(const [id,expected,zone] of [['tesla-milan-italy',4.8,'Europe/Rome'],['tesla-le-chesnay-france',4.2,'Europe/Paris']]){
 const source=raw.find(s=>s.id===id);assert.ok(source);
 const station=adapter.normalizeStation(source),offers=adapter.provedConfigurationOffers(source,station);
 assert.ok(offers.length);assert.equal(offers[0].metadata.timeZone,zone);
 const result=engine.evaluateOffer(offers[0],{energyKwh:10,chargingMinutes:30,connectedMinutes:30,parkingMinutes:0,startAt:'2026-10-15T12:00:00Z',currency:'EUR'});
 assert.equal(result.complete,true,JSON.stringify(result));assert.equal(result.totalEur,expected);
 assert.equal(offers[0].metadata.potentialCongestionFee.conditionVerified,false);
 const unknown=structuredClone(source);unknown.chargingConfigurations[0].pricing.rules[0].unknownFee=12;
 const candidate=adapter.provedConfigurationOffers(unknown,adapter.normalizeStation(unknown))[0];
 assert.equal(engine.evaluateOffer(candidate,{energyKwh:10,startAt:'2026-10-15T00:00:00Z'}).complete,false);
}
console.log('Tesla archived Milan/Le Chesnay: source configuration, EUR, local windows and unsupported fee rejection PASS; national assignment separately required');
