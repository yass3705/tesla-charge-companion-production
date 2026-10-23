import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash,webcrypto} from 'node:crypto';
const require=createRequire(import.meta.url);
const {loadPrepared}=require('../runtime-owned/assets/v9/preproduction-candidate-loader.js');
const {toFragments}=require('../runtime-owned/assets/v9/adapters/canonical-v9.js');
const {createEngine}=require('../runtime-owned/assets/v9/data-engine.js');
const sha=v=>createHash('sha256').update(v).digest('hex');

const payload={schemaVersion:1,source:{id:'FR:ionity_direct',artifactSha256:'a'.repeat(64),generatedAt:'2026-10-20T00:00:00Z'},
  cpos:[{id:'cpo',sourceOperatorId:'ionity',name:'IONITY'}],
  stations:[{id:'station',country:'FR',cpoId:'cpo',sourceStationId:'real-station',name:'IONITY archive',latitude:48,longitude:2}],
  evses:[{id:'evse',cpoId:'cpo',stationId:'station',officialEvseId:null,sourceEvseId:'real-source-evse'}],
  connectors:[{id:'plug',evseId:'evse',sourceConnectorId:'real-plug',officialConnectorId:null,plugType:'CCS',powerKw:350,rawSourceFields:{kind:'DC'}}],
  offers:[{id:'raw-offer',channel:'Direct',scope:{evseId:'evse',connectorId:'plug'},rawOffer:{legacyPrice:'not-validated'}}]};
const raw=JSON.stringify(payload);
const index={schemaVersion:1,bundleId:'candidate-test',status:'prepared',
  sources:[{source:'FR:ionity_direct',path:'sources/FR__ionity_direct.json',sha256:sha(raw)}],rejected:[]};
const files={'/preview/index.json':JSON.stringify(index),'/preview/sources/FR__ionity_direct.json':raw};
const fetcher=async url=>{
  const body=files[new URL(url).pathname];
  return new Response(body||'not found',{status:body?200:404});
};
const config={baseUrl:'https://test.invalid/preview',origin:'https://test.invalid/v9-production-shell/index.html',
  fetchImpl:fetcher,adapter:{toFragments},cryptoImpl:webcrypto};
const prepared=await loadPrepared(config);
const engine=createEngine({registry:prepared.registry,loaders:prepared.loaders});
const result=await engine.queryArea({countryCode:'FR',origin:{lat:48,lon:2},radiusKm:5});
assert.equal(result.stations.length,1);
const station=result.stations[0];
assert.equal(station.evses[0].connectors[0].powerKw,350);
assert.equal(station.offers.length,0,'raw monetary fields cannot enter price engine/ranking');
assert.equal(station.unparsedOffers[0].calculationStatus,'not_evaluated');
assert.equal(station.unparsedOffers[0].scope.connectorId,'plug');
assert.equal(station.provenance[0].sourceId,'FR:ionity_direct');
assert.equal(station.provenance[0].generatedAt,'2026-10-20T00:00:00Z');
assert.equal(prepared.candidate.status,'prepared');
assert.equal(result.diagnostics.sources['prepared:FR:ionity_direct'].loaded,true);

files['/preview/sources/FR__ionity_direct.json']=raw.replace('IONITY archive','changed');
const changed=await loadPrepared(config);
await assert.rejects(changed.loaders['prepared:FR:ionity_direct']({}),/SHA mismatch/);
await assert.rejects(loadPrepared({...config,baseUrl:'https://other.invalid/preview'}),/external preproduction origin blocked/);
const badIndex={...index,status:'partial_failure'};
files['/preview/index.json']=JSON.stringify(badIndex);
await assert.rejects(loadPrepared(config),/partial candidate missing failure report/);
console.log('Prepared candidate map: isolated stations/EVSE, no priced offers, SHA/origin fail closed');
