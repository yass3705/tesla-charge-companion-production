import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {createEngine}=require('../runtime-owned/assets/v9/data-engine.js');
const near={canonicalId:'FR:station:1',sourceStationId:'national-1',countryCode:'FR',
  name:'National site',latitude:48.85,longitude:2.35,
  physicalOperator:{id:'cpo',name:'CPO'},evses:[{id:'evse-1',connectors:[{id:'plug-1',kind:'AC',powerKw:22}]}]};
const exactOverlay={canonicalId:'FR:station:1',countryCode:'FR',name:'Overlay',
  latitude:49.9,longitude:3.9,fieldPriority:{identity:0,rawOfferProvenance:110},
  unparsedOffers:[{id:'raw-exact',channel:'Electroverse',scope:{evseId:'evse-1'}}]};
const withoutCoordinates={canonicalId:'FR:station:1',countryCode:'FR',
  unparsedOffers:[{id:'raw-secondary',channel:'Electra',scope:{evseId:'evse-1'}}],
  fieldPriority:{rawOfferProvenance:0}};
const distant={canonicalId:'FR:station:2',countryCode:'FR',name:'Distant',
  latitude:50.8,longitude:4.3,physicalOperator:{id:'cpo',name:'CPO'},evses:[]};
const sources=[
  {id:'national',countries:['FR'],priority:100,active:true},
  {id:'exact-overlay',countries:['FR'],priority:50,active:true},
  {id:'secondary',countries:['FR'],priority:10,active:true},
];
const loaders={national:async()=>[near,distant],
  'exact-overlay':async()=>[exactOverlay],secondary:async()=>[withoutCoordinates]};
const engine=createEngine({registry:{sources},loaders});
const local=await engine.queryArea({countryCode:'FR',origin:{lat:48.85,lon:2.35},radiusKm:5});
assert.equal(local.stations.length,1);
assert.equal(local.stations[0].id,'FR:station:1');
assert.equal(local.stations[0].latitude,48.85,'distant overlay must not move the physical site');
assert.equal(local.stations[0].unparsedOffers[0].id,'raw-exact',
  'exact identity overlay must survive radius preselection');
assert.deepEqual(local.stations[0].unparsedOffers.map(row=>row.id),['raw-exact','raw-secondary'],
  'raw offers from independent exact sources must not overwrite each other');
assert.deepEqual(local.stations[0].provenance.map(row=>row.sourceId),
  ['exact-overlay','national','secondary']);
const all=await engine.queryArea({countryCode:'FR'});
assert.equal(all.stations.length,2,'unbounded query must still include distant stations');
const far=await engine.queryArea({countryCode:'FR',origin:{lat:50.8,lon:4.3},radiusKm:5});
assert.deepEqual(far.stations.map(row=>row.id),['FR:station:2']);
console.log('V9 exact-identity radius preselection OK');
