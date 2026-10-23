import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {toFragments}=require('../runtime-owned/assets/v9/adapters/canonical-v9.js');

const source={schemaVersion:1,source:{id:'FR:archived_source',artifactSha256:'a'.repeat(64)},
  cpos:[{id:'operator',sourceOperatorId:'archived',name:'Archived'}],
  stations:[{id:'station',country:'FR',cpoId:'operator',sourceStationId:'source-station',name:'Station',latitude:48,longitude:2}],
  evses:[{id:'evse',stationId:'station',sourceEvseId:null,officialEvseId:null}],
  connectors:[{id:'connector',evseId:'evse',sourceConnectorId:'source-connector',officialConnectorId:null,plugType:'CCS',powerKw:150,rawSourceFields:{kind:'DC'}}],
  offers:[{id:'offer',channel:'Direct',scope:{evseId:'evse',connectorId:'connector'},rawOffer:{tariffId:'archived-reference'}}]};
const [station]=toFragments(source);
assert.equal(station.evses[0].officialEvseId,null);
assert.equal(station.evses[0].connectors[0].powerKw,150);
assert.equal(station.evses[0].connectors[0].kind,'DC');
assert.equal(station.evses[0].connectors[0].plugType,'CCS');
assert.equal(station.offers.length,0);
assert.equal(station.unparsedOffers[0].scope.connectorId,'connector');
assert.equal(station.unparsedOffers[0].calculationStatus,'not_evaluated');
assert.equal(station.provenance[0].sourceId,'FR:archived_source');
const swiss=toFragments({...source,stations:[{...source.stations[0],latitude:null,longitude:null,address:{City:'Meyrin'},coordinates:{Google:'46.2 6.1'}}]})[0];
assert.equal(swiss.latitude,46.2);
assert.equal(swiss.longitude,6.1);
assert.equal(swiss.address,'Meyrin');
assert.throws(()=>toFragments({...source,connectors:[{id:'orphan',evseId:'missing'}]}),/connector EVSE missing/);
console.log('Canonical V9 adapter: physical details retained, raw offers not priced');
