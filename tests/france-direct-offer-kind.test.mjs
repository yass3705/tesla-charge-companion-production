import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const adapter=require('../runtime-overrides/assets/v9/adapters/direct-offers.js');
const data=require('../runtime-overrides/assets/v9/data-engine.js');

const station={
  id:'FR:national:FRELCP12954229',countryCode:'FR',physicalOperator:{id:'electra',name:'Electra'},
  aliases:['irve-station:FRELCP12954229'],
  evses:[{id:'FRELCE2KLJ',connectors:[{id:'CCS-1',kind:'DC',powerKw:300}]}]
};
const input={id:'electra-direct-test',provider:'Electra',kind:'direct',stationIds:['irve-station:FRELCP12954229'],countries:['FR'],pricing:{type:'kwh',pricePerKwh:0.49}};
const rule=adapter.directRule(input,'FR');
assert.deepEqual(rule.connectorKinds,[],'tariff kind must not become a connector kind');
assert.equal(data.ruleMatchesStation(rule,station),true,'station scoped direct tariff must reach its exact IRVE station');
const alternate=adapter.directRule({...input,id:'electra-direct-other-grid',pricing:{type:'kwh',pricePerKwh:0.61}},'FR');
const source={id:'france-electra-direct-exact',countries:['FR'],priority:{tariff:135}};
const applied=data.applyOfferRules([station,{...station,id:'FR:national:OTHER',aliases:[],evses:[{id:'OTHER',connectors:[{id:'CCS-2',kind:'DC',powerKw:300}]}]}],
  [{rule,source},{rule:alternate,source}]);
assert.deepEqual(applied[0].offers.map(o=>o.id).sort(),[rule.id,alternate.id].sort(),'distinct official grids must remain visible for ambiguity checks');
assert.equal(applied[1].offers.length,0,'exact station scope must not leak to another Electra station');
assert.deepEqual(adapter.directRule({...input,connectorKinds:['DC']},'FR').connectorKinds,['DC']);
assert.deepEqual(adapter.directRule({...input,kind:'AC'},'FR').connectorKinds,['AC'],'legacy connector kind remains supported');
console.log(JSON.stringify({ok:true,station:station.id,offer:rule.id}));
