import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const runtime=path.resolve(process.argv[2]||path.join(root,'dist/v9-explicit-candidate/runtime'));
const payload=JSON.parse(fs.readFileSync(path.join(runtime,'data/v9/electra-direct-france.json'),'utf8'));
const sessionEngine=require(path.join(runtime,'assets/v9/session-engine.js'));
assert.equal(payload.directOffers.length,410,'pinned Electra capture should yield 410 unambiguous stations');
assert.deepEqual(payload.policy.skipped,[{station:'Montpellier - Auchan Celleneuve',reason:'ambiguous_direct_tariff'}]);
const offer=payload.directOffers.find(item=>item.metadata.officialStationId==='0a650b39-b871-4e78-9670-e56e6b20f329');
assert.ok(offer,'Bois-d’Arcy exact offer is missing');

assert.deepEqual(offer.stationIds,['FRELCP12954082']);
assert.deepEqual(offer.connectorKinds,['DC']);
assert.equal(offer.metadata.officialStationId,'0a650b39-b871-4e78-9670-e56e6b20f329');
assert.equal(offer.pricing.priceSelectionBasis,'session_start_local_time');
assert.equal(offer.pricing.postChargeFeeUnknown,true);
assert.equal(offer.metadata.conditionalCongestionFeeExcluded,true);
const waziers=payload.directOffers.find(item=>item.metadata.stationName==="Waziers - Macdonald's Douai");
assert.equal(waziers?.pricing.rules[0]?.pricePerKwh,0.49,'all-day Electra station rate should be retained');

for(const [startAt,expected] of [
  ['2026-10-06T01:30:00Z',3.9], // 03:30 Paris
  ['2026-10-06T12:55:00Z',4.9], // 14:55 Paris; session crosses the 15:00 change
  ['2026-10-06T15:00:00Z',6.1], // 17:00 Paris
  ['2026-10-06T19:00:00Z',4.9]  // 21:00 Paris
]){
  const station={id:'FR:national:FRELCP12954082',countryCode:'FR',physicalOperator:{name:'Electra'},evses:[{id:'FRELCE2EV6',connectors:[{id:'CCS-400',kind:'DC',powerKw:400}]}],offers:[{...offer,kind:'direct'}]};
  const evaluation=sessionEngine.evaluateStation(station,{startAt,energyKwh:10,durationMinutes:60});
  assert.equal(evaluation.best?.total,expected,startAt);
  assert.equal(evaluation.best?.result?.segmented,false,startAt);
}

const dcStation={id:'FR:national:FRELCP12954082',countryCode:'FR',physicalOperator:{name:'Electra'},evses:[{id:'FRELCE2EV6',connectors:[{id:'CCS-400',kind:'DC',powerKw:400}]}],offers:[{...offer,kind:'direct'}]};
const congestion=sessionEngine.evaluateStation(dcStation,{startAt:'2026-10-06T15:00:00Z',energyKwh:10,durationMinutes:60,postChargeMinutes:10});
assert.equal(congestion.best,null,'unknown congestion fees must not produce a comparable total');
assert.equal(congestion.incomplete[0]?.result?.reason,'post_charge_fee_unknown_for_station');

const acStation={...dcStation,evses:[{id:'AC',connectors:[{id:'Type2',kind:'AC',powerKw:22}]}]};
assert.equal(sessionEngine.evaluateStation(acStation,{startAt:'2026-10-06T15:00:00Z',energyKwh:10,durationMinutes:60}).eligibleOfferCount,0,
  'historical AC connectors must not inherit the DC tariff');

console.log('Electra Bois-d’Arcy exact energy tariff and session-start locking OK');
