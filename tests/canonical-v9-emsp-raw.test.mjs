import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {toFragments}=require('../runtime-owned/assets/v9/adapters/canonical-v9.js');
const {resolveEntities}=require('../runtime-owned/assets/v9/data-engine.js');

const physical={schemaVersion:1,source:{id:'FR:irve_static',artifactSha256:'a'.repeat(64)},
  cpos:[{id:'cpo',country:'FR',sourceOperatorId:'CPO',name:'Physical operator'}],
  stations:[{id:'station',country:'FR',cpoId:'cpo',sourceStationId:'S',name:'Physical station',latitude:48,longitude:2}],
  evses:[{id:'evse',country:'FR',stationId:'station',cpoId:'cpo',sourceEvseId:'FR*ABC*E1',officialEvseId:'FR*ABC*E1'}],
  connectors:[{id:'plug',evseId:'evse',sourceConnectorId:'P1',officialConnectorId:'P1',kind:'DC',powerKw:120}],offers:[]};
const emsp=structuredClone(physical);
emsp.source={id:'FR:emsp_exact',artifactSha256:'b'.repeat(64)};
emsp.stations[0].name='Overlay should not replace physical station';
emsp.connectors[0].powerKw=22;
emsp.offers=[{id:'raw-e',channel:'Electroverse',scope:{evseId:'evse',connectorId:null},
  rawOffer:{pricing:{type:'rules',rules:[{pricePerKwh:.5}]}},calculationStatus:'not_evaluated'}];
const physicalFragment=toFragments(physical)[0],emspFragment=toFragments(emsp)[0];
assert.equal(emspFragment.offers.length,0,'archived eMSP tariff is not calculated by the canonical adapter');
assert.equal(emspFragment.unparsedOffers[0].channel,'Electroverse');
const merged=resolveEntities([
  {source:{id:'prepared:FR:irve_static',priority:100},fragment:physicalFragment},
  {source:{id:'prepared:FR:emsp_exact',priority:100},fragment:emspFragment}
]);
assert.equal(merged.length,1,'exact canonical station identity must not multiply the station');
assert.equal(merged[0].name,'Physical station');
assert.equal(merged[0].evses[0].connectors[0].powerKw,120,'eMSP overlay must not replace national connector power');
assert.equal(merged[0].offers.length,0);
assert.equal(merged[0].unparsedOffers[0].channel,'Electroverse');
assert.deepEqual(merged[0].unparsedOffers[0].scope,{evseId:'evse',connectorId:null});
console.log('Canonical V9 eMSP exact raw overlay: physical topology and pricing isolation pass');
