import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {toFragments}=require('../runtime-owned/assets/v9/adapters/canonical-v9.js');
const {resolveEntities}=require('../runtime-owned/assets/v9/data-engine.js');
const stationId='tcc:exact-national-station',cpoId='tcc:izivia-cpo';
const canonical={schemaVersion:1,source:{id:'FR:izivia_fast_map',artifactSha256:'a'.repeat(64)},
  cpos:[{id:cpoId,sourceOperatorId:'IZIVIA',name:'IZIVIA'}],
  stations:[{id:stationId,country:'FR',cpoId,sourceStationId:'FRIZFPFAST1',name:'Official map',
    latitude:48.8,longitude:2.5,rawSourceFields:{evses:[{id:'map-socket-group',stalls:4}]}}],
  evses:[],connectors:[],offers:[]};
const map=toFragments(canonical)[0];
assert.deepEqual(map.fieldPriority,{identity:0,connectors:0});
assert.deepEqual(map.evses,[]);
const national={canonicalId:stationId,countryCode:'FR',name:'National station',latitude:48.8,longitude:2.5,
  physicalOperator:{id:'IZIVIA',name:'IZIVIA'},evses:[{id:'official-evse',connectors:[{id:'official-plug',kind:'DC',powerKw:150}]}],offers:[]};
const merged=resolveEntities([{source:{id:'national',priority:100},fragment:national},
  {source:{id:'prepared:FR:izivia_fast_map',priority:200},fragment:map}]);
assert.equal(merged.length,1,'the exact national station must remain one map card');
assert.deepEqual(merged[0].evses,national.evses,'map socket groups must not replace official EVSEs');
assert.equal(merged[0].offers.length,0,'the unjoined direct tariff must not be priced');
assert.deepEqual(merged[0].provenance.map(row=>row.sourceId),['FR:izivia_fast_map','national']);
console.log('IZIVIA FAST exact-station raw map join OK');
