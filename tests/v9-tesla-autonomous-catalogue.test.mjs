import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {consolidateNational,resolveEntities}=require('../runtime-owned/assets/v9/data-engine.js');
for(const country of ['FR','IT','CH','DE','ES','NL','GB','MA','BE']){
 const reference=country+':national';
 const mac={source:{id:'tesla-global',adapter:'tesla-json'},fragment:{canonicalId:'tesla-source',sourceStationId:'tesla-source',countryCode:country,physicalOperator:{id:'tesla',name:'Tesla'},evses:[{id:'tesla-config',connectors:[{id:'tesla-config-ccs',kind:'DC',powerKw:250}]}],offers:[{id:'exact-config',kind:'direct',currency:'EUR',evseIds:['tesla-config'],pricing:{type:'kwh',pricePerKwh:.42}}]}};
 const duplicate={source:{id:'prepared:'+reference},fragment:{canonicalId:'national-tesla',sourceStationId:'national-tesla',countryCode:country,physicalOperator:{id:'TESLA FRANCE SARL'},evses:[{id:'national-e',officialEvseId:'OFFICIAL-SOURCE-ID',connectors:[]}],offers:[{id:'must-not-migrate'}]}};
 const other={source:{id:'prepared:'+reference},fragment:{canonicalId:'national-other',sourceStationId:'national-other',countryCode:country,physicalOperator:{id:'other'},evses:[],offers:[]}};
 const before=JSON.stringify([mac,duplicate,other]);
 for(const policy of [{[country]:reference},{}]){
  const actual=consolidateNational([mac,duplicate,other],policy);
  assert.deepEqual(actual.items.map(i=>i.fragment.canonicalId),['tesla-source','national-other']);
  const tesla=resolveEntities(actual.items).find(s=>s.id==='tesla-source');
  assert.deepEqual(tesla.evses,mac.fragment.evses);assert.equal(tesla.offers.length,1);
  assert.deepEqual(tesla.offers[0].evseIds,['tesla-config']);assert.equal(tesla.evses[0].officialEvseId,undefined);
  assert.equal(consolidateNational([mac],policy).items.length,1,'Tesla works even with no national file');
 }
 assert.equal(JSON.stringify([mac,duplicate,other]),before,'raw national and Mac input retained');
}
console.log('Tesla autonomous in all nine countries; no national identities or tariffs required or transferred PASS');
const {createEngine}=require('../runtime-owned/assets/v9/data-engine.js');
let nationalCalls=0;
const engine=createEngine({registry:{autonomousTesla:true,nationalCatalogues:{FR:'FR:irve_static'},sources:[{id:'tesla-global',adapter:'tesla-json'},{id:'prepared:FR:irve_static'}]},loaders:{'tesla-global':async()=>[{canonicalId:'tesla-test',sourceStationId:'tesla-test',countryCode:'FR',physicalOperator:{id:'tesla'},evses:[],offers:[]}],'prepared:FR:irve_static':async()=>{nationalCalls++;throw Error('National unavailable');}}});
assert.equal((await engine.queryArea({countryCode:'FR',filters:{operatorIds:['tesla']}})).stations.length,1);
assert.equal(nationalCalls,0,'Tesla-only must not depend on national acquisition/availability');
