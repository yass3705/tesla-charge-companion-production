import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const runtime=path.resolve(process.argv[2]||path.join(root,'dist/v9-explicit-candidate/runtime'));
const payload=JSON.parse(fs.readFileSync(path.join(runtime,'data/v9/izivia-fast-france.json'),'utf8'));
const inventory=JSON.parse(fs.readFileSync(path.join(runtime,'data/v9/izivia-fast-inventory-france.json'),'utf8'));
const adapter=require(path.join(runtime,'assets/v9/adapters/direct-offers.js'));
const dataEngine=require(path.join(runtime,'assets/v9/data-engine.js'));
const sessionEngine=require(path.join(runtime,'assets/v9/session-engine.js'));

assert.equal(payload.policy.exactStationIdsOnly,true);
assert.equal(payload.policy.networkDefault,false);
assert.equal(payload.policy.expressExcluded,true);
assert.equal(payload.policy.capturedStations,620);
assert.equal(payload.policy.pricedStations,616);
assert.equal(payload.policy.mapOnlyStationsWithoutNationalInventory,45);
assert.equal(inventory.stations.length,616);
const noisyInventory=inventory.stations.find(row=>row.sourceStationId==='FRIZFPFAST1');
assert.ok(noisyInventory);
assert.ok(noisyInventory.evses.some(evse=>evse.stalls===4&&evse.connectors.some(c=>c.kind==='DC'&&c.powerKw===200)));
assert.ok(noisyInventory.evses.some(evse=>evse.stalls===2&&evse.connectors.some(c=>c.kind==='AC'&&c.powerKw===22)));
assert.ok(noisyInventory.evses.every(evse=>!evse.pdcIds),'map-level connector counts must not invent exact PDC IDs');
assert.deepEqual(payload.policy.excludedStations.map(row=>row.stationId).sort(),
  ['FRIZFPFAST339','FRIZFPFAST408','FRIZFPFAST560','FRIZFPFAST730']);

const rules=adapter.normalizePayload(payload).offerRules;
assert.equal(rules.length,8);
const offer=(id,kind,power)=>rules.find(rule=>rule.stationIds.includes(id)&&rule.connectorKinds.includes(kind)&&rule.minPowerKw<=power&&rule.maxPowerKw>=power);
const dole=offer('FRIZFPFAST422','DC',150);
assert.ok(dole,'Dole CCS tariff must come from the national official capture');
assert.ok(offer('FRIZFPFAST150','DC',150),'an exact-name location offset must remain priced');
assert.ok(offer('FRIZFPFAST1','AC',22),'official station-level price covers verified 22 kW Type 2');
assert.equal(offer('FRIZFPFAST422','AC',150),undefined,'old implausible AC 150 kW row must stay unpriced');
assert.equal(offer('FRIZFPFAST339','DC',150),undefined,'station lacking connector evidence must stay unpriced');
assert.equal(offer('FRIZFPFAST9999','DC',150),undefined,'unknown FAST station must stay unpriced');

function station(id,kind='DC',powerKw=150,rule=dole){
  return{id:`FR:national:${id}`,countryCode:'FR',physicalOperator:{name:'IZIVIA'},
    provenance:[{sourceStationId:id}],evses:[{id:`${id}-evse`,connectors:[{kind,powerKw}]}],offers:[rule]};
}
assert.ok(dataEngine.ruleMatchesStation(dole,station('FRIZFPFAST422')));
assert.equal(dataEngine.ruleMatchesStation(dole,station('FRIZFPFAST9999')),false);
assert.equal(dataEngine.ruleMatchesStation(dole,station('FRE04POAZS102')),false,'Express must not inherit FAST price');
assert.equal(dole.pricing.priceSelectionBasis,'session_start_local_time');
assert.equal(dole.pricing.connectedTimeRounding,'started_minute');
assert.ok(dole.pricing.rules.every(rule=>rule.energyRounding==='started_kwh'&&rule.connectedTimeFreeMinutes===60));

for(const [startAt,minutes,total] of [
  ['2026-10-06T07:00:00Z',60,3.30],
  ['2026-10-06T08:59:00Z',60.01,3.60],
  ['2026-10-06T09:00:00Z',60.01,4.15],
  ['2026-10-06T08:59:00Z',120,21.30],
]){
  assert.equal(sessionEngine.evaluateStation(station('FRIZFPFAST422'),{startAt,energyKwh:10.1,durationMinutes:minutes}).best?.total,total);
}

console.log('IZIVIA FAST national exact-station coverage, connector scope and session billing OK');
