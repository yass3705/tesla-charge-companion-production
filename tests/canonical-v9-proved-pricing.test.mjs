import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash,webcrypto} from 'node:crypto';
const require=createRequire(import.meta.url);
const {toFragments}=require('../runtime-owned/assets/v9/adapters/canonical-v9.js');
const {evaluateOffer}=require('../runtime-owned/assets/v9/pricing-engine.js');
const {evaluateStation}=require('../runtime-owned/assets/v9/session-engine.js');
const {loadPrepared}=require('../runtime-owned/assets/v9/preproduction-candidate-loader.js');
const {simpleEnergyPrice}=require('../runtime-overrides/assets/v9/adapters/atlante-italy-exact.js');

const source={schemaVersion:1,source:{id:'FR:ionity_direct',artifactSha256:'a'.repeat(64)},
  cpos:[{id:'operator',name:'IONITY',sourceOperatorId:'IONITY_CPO'}],
  stations:[{id:'station',country:'FR',cpoId:'operator',sourceStationId:'site',name:'Site'}],
  evses:[{id:'evse-a',stationId:'station',cpoId:'operator'},
    {id:'evse-b',stationId:'station',cpoId:'operator'}],
  connectors:[{id:'plug-a',evseId:'evse-a',powerKw:150,rawSourceFields:{kind:'DC'}},
    {id:'plug-b',evseId:'evse-b',powerKw:150,rawSourceFields:{kind:'DC'}}],
  offers:[{id:'offer-a',channel:'Direct',scope:{evseId:'evse-a',connectorId:'plug-a'},
    rawOffer:{pricePerKwhEur:0.70},calculationStatus:'not_evaluated'},
    {id:'offer-b',channel:'Direct',scope:{evseId:'evse-b',connectorId:'plug-b'},
      rawOffer:{pricePerKwhEur:0.90,unknownFee:1},calculationStatus:'not_evaluated'}]};

const station=toFragments(source)[0];
assert.equal(station.offers.length,1);
assert.deepEqual(station.offers[0].connectorIds,['plug-a']);
assert.deepEqual(station.offers[0].evseIds,['evse-a']);
assert.equal(station.unparsedOffers.length,1,'unknown component stays outside calculation');
assert.equal(station.unparsedOffers[0].id,'offer-b');
const oracle=evaluateOffer(station.offers[0],{energyKwh:20,startAt:'2026-10-23T12:00:00Z'});
assert.equal(oracle.complete,true);
assert.equal(oracle.totalEur,14);
assert.equal(evaluateStation({...station,evses:[station.evses[1]]},{energyKwh:20,startAt:'2026-10-23T12:00:00Z'}).comparableOfferCount,0,
  'exact connector offer cannot price another EVSE');
for(const invalid of [0,-1,NaN,'0.70',null]){
  const changed=structuredClone(source);
  changed.offers[0].rawOffer.pricePerKwhEur=invalid;
  assert.equal(toFragments(changed)[0].offers.length,0);
}
const otherCountry=structuredClone(source);
otherCountry.source.id='GB:ionity_direct';
assert.equal(toFragments(otherCountry)[0].offers.length,0,'country without matched oracle remains unpriced');
const bytes=new TextEncoder().encode(JSON.stringify(source));
const sha=createHash('sha256').update(bytes).digest('hex');
const index={schemaVersion:1,status:'prepared',bundleId:'test',rejected:[],
  sources:[{source:'FR:ionity_direct',path:'sources/FR__ionity_direct.json',sha256:sha}]};
const fetchImpl=async url=>({ok:true,arrayBuffer:async()=>
  url.endsWith('index.json')?new TextEncoder().encode(JSON.stringify(index)).buffer:bytes.buffer});
const prepared=await loadPrepared({baseUrl:'http://127.0.0.1/prepared-v9/',
  origin:'http://127.0.0.1/',fetchImpl,cryptoImpl:webcrypto,adapter:{toFragments}});
assert.equal((await prepared.loaders['prepared:FR:ionity_direct']())[0].offers.length,1);
const tampered=await loadPrepared({baseUrl:'http://127.0.0.1/prepared-v9/',
  origin:'http://127.0.0.1/',fetchImpl,cryptoImpl:webcrypto,adapter:{toFragments(data){
    const fragments=toFragments(data);fragments[0].offers[0].pricing.rules[0].unknownFee=1;return fragments;
  }}});
await assert.rejects(tampered.loaders['prepared:FR:ionity_direct'](),/candidate pricing isolation violated/);
const component={conditions:[],currency:'EUR',price:{excl_vat:0.65,incl_vat:0.79},
  priceDimension:'ENERGY',stepSize:null,surchargeName:null,
  validity:{absolute:{daysOfWeekValidity:[],validitySchemes:[]},relative:{displayText:[],maxDurationInMinutes:null}}};
const tariff={connectorId:'IT*ATE*E1-C1',identifiers:{evseId:'IT*ATE*E1',connectorId:'C1'},priceComponents:[component]};
const sourceConnector={evseId:'IT*ATE*E1',connectorId:'C1',powerType:'DC',pricePerKwhEur:0.79,tariffs:[tariff]};
const atlante={...structuredClone(source),source:{id:'IT:atlante_direct',artifactSha256:'b'.repeat(64)}};
atlante.stations[0].country='IT';
atlante.connectors[0].rawSourceFields=sourceConnector;
atlante.offers=[{id:'atlante-simple',channel:'Direct',scope:{evseId:'evse-a',connectorId:'plug-a'},
  rawOffer:tariff,calculationStatus:'not_evaluated'}];
assert.equal(simpleEnergyPrice(sourceConnector),0.79,'match historical exact Atlante oracle');
const atlanteFragment=toFragments(atlante)[0];
assert.equal(atlanteFragment.offers.length,1);
assert.equal(evaluateOffer(atlanteFragment.offers[0],{energyKwh:20,startAt:'2026-10-23T12:00:00Z'}).totalEur,15.8);
for(const mutation of [
  d=>{d.offers[0].rawOffer.priceComponents[0].stepSize=1000;},
  d=>{d.offers[0].rawOffer.priceComponents.push({...component,priceDimension:'TIME'});},
  d=>{d.offers[0].rawOffer.priceComponents[0].conditions.push({type:'minDuration'});},
  d=>{d.offers[0].rawOffer.priceComponents[0].price.incl_vat=0.80;},
  d=>{d.connectors[0].powerKw=null;},
  d=>{d.offers[0].scope.connectorId='not-a-connector';},
]){
  const changed=structuredClone(atlante);mutation(changed);
  assert.equal(toFragments(changed)[0].offers.length,0,'complex or inconsistent tariff stays out of ranking');
}
console.log('Canonical V9: proved FR/IT energy rates, exact connectors, unsupported terms unpriced');
