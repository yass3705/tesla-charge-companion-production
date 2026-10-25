import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {toFragments}=require('../runtime-owned/assets/v9/adapters/canonical-v9.js');
const {resolveEntities}=require('../runtime-owned/assets/v9/data-engine.js');
const {tariffLaneState,renderTariffs,rankRows,renderStationCard,stationCards}=require('../v9-production-shell/bridge.js');

const canonical={schemaVersion:1,source:{id:'FR:fixture',artifactSha256:'a'.repeat(64)},
  cpos:[{id:'cpo',name:'Archived network',sourceOperatorId:'archived'}],
  stations:[{id:'s',country:'FR',cpoId:'cpo',sourceStationId:'exact-site',name:'Archived charging',latitude:48,longitude:2}],
  evses:[{id:'e1',stationId:'s',cpoId:'cpo'},{id:'e2',stationId:'s',cpoId:'cpo'}],
  connectors:[{id:'c1',evseId:'e1',powerKw:150,plugType:'CCS',rawSourceFields:{kind:'DC'}},
              {id:'c2',evseId:'e2',powerKw:22,plugType:'TYPE_2',rawSourceFields:{kind:'AC'}}],
  offers:[{id:'raw-direct',channel:'Direct',scope:{evseId:'e1',connectorId:'c1'},
    sourceConnectorId:'source-plug',proof:'archived_exact_connector',rawOffer:{unvalidatedRate:999}},
          {id:'raw-electroverse',channel:'Electroverse',scope:{evseId:'e2',connectorId:'c2'},rawOffer:{unvalidatedRate:777}}]};
const fragment=toFragments(canonical)[0];
const station=resolveEntities([{fragment,source:{id:'prepared:FR:fixture',priority:100}}])[0];
assert.equal(station.offers.length,0);
assert.equal(station.unparsedOffers.length,2);
assert.equal(station.unparsedOffers.find(offer=>offer.id==='raw-direct').sourceConnectorId,'source-plug');
assert.equal(station.unparsedOffers.find(offer=>offer.id==='raw-direct').proof,'archived_exact_connector');
const fast={...station,evses:station.evses.filter(x=>x.id==='e1')};
const slow={...station,evses:station.evses.filter(x=>x.id==='e2')};
assert.equal(tariffLaneState(null,fast,'direct').status,'unresolved');
assert.equal(tariffLaneState(null,fast,'electroverse').status,'missing');
assert.equal(tariffLaneState(null,slow,'direct').status,'missing');
assert.equal(tariffLaneState(null,slow,'electroverse').status,'unresolved');
const rendered=renderTariffs(null,fast);
assert.match(rendered,/Tarif incalculable/);
assert.doesNotMatch(rendered,/999|777/);
assert.doesNotMatch(rendered,/data-v9-effective-total/);
const ranked=rankRows([{station,total:null,distanceKm:2,evaluation:null}], 'price',20);
assert.equal(ranked.length,1,'unpriced station remains visible');
assert.equal(ranked[0].total,null,'unevaluated offer cannot enter ranking');
console.log('TCC map: exact EVSE lanes unresolved, no leaked amounts or priced ranking');
