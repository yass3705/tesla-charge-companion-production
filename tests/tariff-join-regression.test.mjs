import assert from 'node:assert/strict';
import path from 'node:path';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const runtime=path.resolve(process.argv[2]||'dist/v9-explicit-candidate/runtime');
const dataEngine=require(path.join(runtime,'assets/v9/data-engine.js'));
const directOffers=require(path.join(runtime,'assets/v9/adapters/direct-offers.js'));
const sessionEngine=require(path.join(runtime,'assets/v9/session-engine.js'));
const planner=require(path.join(runtime,'assets/v9/session-planner-engine.js'));
const shell=require('../v9-production-shell/bridge.js');

const station={
  id:'FR:national:TEST1',aliases:['alias:TEST1'],countryCode:'FR',name:'Jointure test',address:'1 rue du Test',
  latitude:48.8,longitude:2.0,physicalOperator:{name:'Electra'},offers:[],
  evses:[
    {id:'FR*E*AC22',pdcIds:['FR*E*AC22'],connectors:[{id:'AC22',kind:'AC',powerKw:22}]},
    {id:'FR*E*DC150',pdcIds:['FR*E*DC150'],connectors:[{id:'DC150',kind:'DC',powerKw:150}]}
  ]
};
const tariffs=directOffers.normalizePayload({country:'FR',directOffers:[
  {id:'direct-ac',provider:'Electra direct AC',stationIds:['TEST1'],operatorAliases:['Electra'],connectorKinds:['AC'],minPowerKw:22,maxPowerKw:22,pricing:{type:'kwh',pricePerKwh:0.4}},
  {id:'direct-dc',provider:'Electra direct DC',stationIds:['TEST1'],operatorAliases:['Electra'],connectorKinds:['DC'],pricing:{type:'kwh',pricePerKwh:0.5}}
],emspOffers:[
  {id:'electroverse',provider:'Electroverse',stationIds:['TEST1'],pricing:{type:'kwh',pricePerKwh:0.6}},
  {id:'electra-platform',provider:'Electra',evseIds:['FR*E*DC150'],verifiedScope:'exact_evse',pricing:{type:'kwh',pricePerKwh:0.7}}
]}).offerRules;
const joined=dataEngine.applyOfferRules([station],tariffs.map(rule=>({rule,source:{id:'tariff-test',priority:{tariff:100}}})))[0];
assert.equal(joined.offers.length,4,'direct and both platform offers must attach independently');

const session={startAt:'2026-10-06T12:00:00Z',energyKwh:10,durationMinutes:60,batteryCapacityKwh:75,startSoc:25,targetSoc:50,vehicleMaxAcKw:22,vehicleMaxDcKw:150};
const highest=sessionEngine.evaluateStation(joined,session);
assert.deepEqual(new Set([highest.best,...highest.alternatives].filter(Boolean).map(x=>x.offerId)),
  new Set(['direct-dc','electroverse','electra-platform']),
  'null power bounds must not erase direct or platform offers');

const area={effectiveSession:session,routes:{byStationId:{}}};
const engine={planStation:planner.planStation,evaluateStation:sessionEngine.evaluateStation,
  scoreStation:(site)=>({stationId:site.id,distanceKm:2})};
const rows=shell.groupRows([{station:joined,evaluation:highest,score:{distanceKm:2},distanceKm:2}],{engine,area,selectedSubscriptions:[]});
assert.equal(rows.length,2,'one result is required for each power');
const byPower=new Map(rows.map(row=>[row.displayPowerKw,row]));
const shown=row=>new Set([row.evaluation.best,...row.evaluation.alternatives,...row.evaluation.incomplete].filter(Boolean).map(x=>x.offerId));
assert.deepEqual(shown(byPower.get(22)),new Set(['direct-ac','electroverse']),
  'the 22 kW line must retain its own direct and Electroverse offers');
assert.deepEqual(shown(byPower.get(150)),new Set(['direct-dc','electroverse','electra-platform']),
  'the 150 kW line must retain its direct, Electroverse and exact-EVSE Electra offers');
assert.ok(byPower.get(22).score&&byPower.get(150).score);
assert.ok(byPower.get(22).evaluation.chargingPowerKw===22);
assert.ok(byPower.get(150).evaluation.chargingPowerKw===150);

const fallbackStation={...joined,evses:[joined.evses[0]],offers:[
  ...joined.offers.filter(offer=>offer.id==='direct-dc'),
  {id:'national-ac',provider:'National AC',kind:'national_fallback',evseIds:['FR*E*AC22'],pricing:{type:'kwh',pricePerKwh:0.45}}
]};
const fallback=sessionEngine.evaluateStation(fallbackStation,session);
assert.equal(fallback.best?.offerId,'national-ac',
  'a DC direct offer must not erase the AC fallback before connector filtering');

const grouped=shell.groupRows([
  {station:{...station,id:'A',evses:[station.evses[0]]},evaluation:{best:{offerId:'provider-a',provider:'Provider A',kind:'emsp',comparable:true,total:4}},distanceKm:2},
  {station:{...station,id:'B',evses:[{...station.evses[0],id:'FR*E*AC22B',pdcIds:['FR*E*AC22B']}]},evaluation:{best:{offerId:'provider-b',provider:'Provider B',kind:'emsp',comparable:true,total:5}},distanceKm:2}
]);
assert.equal(grouped.length,1,'same site, operator and power should be one row');
assert.deepEqual(shown(grouped[0]),new Set(['provider-a','provider-b']),
  'grouping must preserve tariffs carried by different source rows');

console.log('V9 tariff join and per-power result regression OK');
