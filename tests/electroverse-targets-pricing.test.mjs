import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const snapshot=path.resolve(process.argv[2]||'dist/v9-explicit-candidate');
const runtime=path.join(snapshot,'runtime');
const payload=JSON.parse(fs.readFileSync(path.join(snapshot,'snapshot-inputs/FR/platforms/electroverse-runtime-offers.json'),'utf8'));
const normalized=require(path.join(runtime,'assets/v9/adapters/direct-offers.js')).normalizePayload({country:'FR',emspOffers:payload.emspOffers}).offerRules;
const engine=require(path.join(runtime,'assets/v9/session-engine.js'));
const find=(sid,pk)=>normalized.find(offer=>offer.stationIds.includes(sid)&&offer.metadata.electroverseLocationPk===pk);
const electra=find('FRELCP12954082','4051990');
const lidl=find('FRLDLPLFR3233EVCP','821499');
assert.ok(electra&&lidl,'both reported stations must have verified Electroverse offers');
function price(offer,stationId,kind,powerKw,durationMinutes){
  const station={id:stationId,countryCode:'FR',physicalOperator:{name:stationId.startsWith('FRELC')?'Electra':'Lidl'},evses:[{id:'probe',connectors:[{id:'probe-connector',kind,powerKw}]}],offers:[offer]};
  return engine.evaluateStation(station,{startAt:'2026-10-06T12:00:00Z',timeZone:'Europe/Paris',energyKwh:10,durationMinutes,chargingMinutes:durationMinutes}).best?.total;
}
assert.equal(price(lidl,'FRLDLPLFR3233EVCP','AC',22,30),2.9,'Lidl Dole Electroverse 0.29 EUR/kWh');
assert.equal(price(electra,'FRELCP12954082','DC',400,30),6.9,'Electra Bois-d’Arcy Electroverse 0.69 EUR/kWh');
assert.equal(price(electra,'FRELCP12954082','DC',400,70),10.9,'Electra Electroverse charges 0.40 EUR/min after one hour');
console.log('Reported Electroverse stations and duration rule OK');
