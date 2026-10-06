import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const runtime=path.resolve(process.argv[2]||path.join(root,'dist/v9-explicit-candidate/runtime'));
const payload=JSON.parse(fs.readFileSync(path.join(runtime,'data/v9/izivia-fast-dole-direct.json'),'utf8'));
const inventory=JSON.parse(fs.readFileSync(path.join(runtime,'data/v9/izivia-fast-dole-inventory.json'),'utf8'));
const adapter=require(path.join(runtime,'assets/v9/adapters/direct-offers.js'));
const dataEngine=require(path.join(runtime,'assets/v9/data-engine.js'));
const sessionEngine=require(path.join(runtime,'assets/v9/session-engine.js'));
const {groupRows}=require(path.join(root,'v9-production-shell/bridge.js'));

assert.equal(payload.directOffers.length,1);
const offer=adapter.normalizePayload(payload).offerRules[0];
assert.deepEqual(offer.stationIds,['FRIZFPFAST422']);
assert.deepEqual(offer.connectorKinds,['DC']);
assert.equal(offer.pricing.connectedTimeRounding,'started_minute');
assert.equal(offer.pricing.priceSelectionBasis,'session_start_local_time');
assert.ok(offer.pricing.rules.every(rule=>rule.energyRounding==='started_kwh'&&rule.connectedTimeFreeMinutes===60&&rule.connectedTimePerMinuteAfterFreeEur===0.30));

function station(id='FRIZFPFAST422',kind='DC',powerKw=150){
  return{id:`FR:national:${id}`,countryCode:'FR',physicalOperator:{name:'IZIVIA'},provenance:[{sourceStationId:id}],
    evses:[{id:'FRIZFEFAST42211',connectors:[{id:'ccs',kind,powerKw}]}],offers:[offer]};
}
assert.ok(dataEngine.ruleMatchesStation(offer,station()));
assert.equal(dataEngine.ruleMatchesStation(offer,station('FRIZFPFAST430')),false,'another Dole FAST site must remain unpriced');
assert.equal(dataEngine.ruleMatchesStation(offer,station('FRIZFPEXPRESS')),false,'Express must not inherit FAST price');
assert.equal(inventory.stations.length,1);
const supplemented=dataEngine.resolveEntities([
  {source:{id:'france-national',priority:{identity:55,connectors:60}},fragment:{
    canonicalId:'FR:national:FRIZFPFAST422',sourceStationId:'FRIZFPFAST422',countryCode:'FR',
    physicalOperator:{name:'IZIVIA'},evses:[{id:'old-ac',connectors:[{kind:'AC',powerKw:150}]}]}},
  {source:{id:'france-izivia-fast-dole-inventory',priority:{identity:40,connectors:95}},fragment:inventory.stations[0]},
])[0];
assert.equal(supplemented.evses.find(evse=>evse.id==='irve-1-dc-150')?.pdcIds.length,2);
assert.equal(supplemented.evses.length,2,'official map confirms a separate 22 kW Type 2 point');
assert.ok(supplemented.evses.some(evse=>evse.id==='irve-0-ac-22'&&evse.connectors[0]?.powerKw===22));
assert.ok(supplemented.evses.every(evse=>!evse.connectors.some(connector=>connector.kind==='AC'&&connector.powerKw===150)));
const supplementedPriced=dataEngine.applyOfferRules([supplemented],[{rule:offer,source:{id:'france-izivia-fast-dole-direct',priority:{tariff:125}}}])[0];
assert.ok(supplementedPriced.offers.some(item=>item.sourceId==='france-izivia-fast-dole-direct'));
const supplementedEvaluation=sessionEngine.evaluateStation(supplementedPriced,{startAt:'2026-10-06T07:00:00Z',energyKwh:10.1,durationMinutes:60});
const displayed=groupRows([{station:supplementedPriced,evaluation:supplementedEvaluation,total:supplementedEvaluation.best?.total,distanceKm:2}]);
assert.equal(displayed.length,2);
const dcRow=displayed.find(row=>row.displayPowerKw===150);
assert.equal(dcRow?.pointCount,2,'Dole FAST 150 kW result must count the two verified CCS points');
assert.equal(dcRow?.total,3.30);
assert.equal(displayed.find(row=>row.displayPowerKw===22)?.pointCount,1);
const nationalTileStation=station();
nationalTileStation.evses=[
  {id:'FRIZFEFAST42212',connectors:[{id:'type2-150',kind:'AC',powerKw:150}]},
  {id:'FRIZFEFAST42211',connectors:[{id:'ccs-150',kind:'DC',powerKw:150}]},
];
assert.equal(sessionEngine.evaluateStation(nationalTileStation,{startAt:'2026-10-06T07:00:00Z',energyKwh:10.1,durationMinutes:60}).best?.total,3.30,
  'the national tile lists an AC 150 kW row before DC; the DC connector must be selected');

for(const [startAt,energyKwh,durationMinutes,expected] of [
  ['2026-10-06T06:59:00Z',10.1,60,3.85], // 08:59 Paris
  ['2026-10-06T07:00:00Z',10.1,60,3.30], // 09:00 Paris
  ['2026-10-06T08:59:00Z',10.1,60.01,3.60], // 10:59 Paris; 11 kWh, one started excess minute
  ['2026-10-06T09:00:00Z',10.1,60.01,4.15], // 11:00 Paris
  ['2026-10-06T12:59:00Z',10.1,60,3.85], // 14:59 Paris
  ['2026-10-06T13:00:00Z',10.1,60,3.30], // 15:00 Paris
  ['2026-10-06T15:00:00Z',10.1,60,3.85], // 17:00 Paris
  ['2026-10-06T08:59:00Z',10.1,120,21.30], // price stays locked after 11:00
]){
  const result=sessionEngine.evaluateStation(station(),{startAt,energyKwh,durationMinutes});
  assert.equal(result.best?.total,expected,startAt);
  assert.equal(result.best?.result?.segmented,false,startAt);
}
assert.equal(sessionEngine.evaluateStation(station(),{startAt:'2026-10-06T07:00:00Z',energyKwh:10.1,durationMinutes:59.99}).best?.total,3.30);
assert.equal(sessionEngine.evaluateStation(station('FRIZFPFAST422','AC'),{startAt:'2026-10-06T07:00:00Z',energyKwh:10.1,durationMinutes:60}).eligibleOfferCount,0);
assert.equal(sessionEngine.evaluateStation(station('FRIZFPFAST422','DC',50),{startAt:'2026-10-06T07:00:00Z',energyKwh:10.1,durationMinutes:60}).eligibleOfferCount,0);

console.log('IZIVIA FAST Dole station tariff, locked windows and started-unit billing OK');
