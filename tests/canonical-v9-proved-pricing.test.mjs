import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash,webcrypto} from 'node:crypto';
const require=createRequire(import.meta.url);
const {toFragments}=require('../runtime-owned/assets/v9/adapters/canonical-v9.js');
const {evaluateOffer}=require('../runtime-overrides/assets/v9/pricing-engine.js');
const historicalPricing=require('../runtime-overrides/assets/v9/pricing-engine.js');
const historicalOcpi=require('../runtime-overrides/assets/v9/adapters/uk-open-feeds.js');
const {evaluateStation}=require('../runtime-owned/assets/v9/session-engine.js');
const {loadPrepared}=require('../runtime-owned/assets/v9/preproduction-candidate-loader.js');
const {simpleEnergyPrice}=require('../runtime-overrides/assets/v9/adapters/atlante-italy-exact.js');
const {directEnergyPrice}=require('../runtime-overrides/assets/v9/adapters/belgium-nap.js');

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
const bePrice={rateId:'R1',ratePolicy:'adHoc',currency:'EUR',priceType:'pricePerKWh',
  value:0.35,taxIncluded:false,taxRate:21};
const belgium={...structuredClone(source),source:{id:'BE:nap_static',artifactSha256:'c'.repeat(64)}};
belgium.stations[0].country='BE';
belgium.evses[0].unclassifiedPrices=[];
belgium.evses[0].archiveVariants=[];
belgium.connectors[0].plugType='iec62196T2';
belgium.connectors[0].powerKw=22;
belgium.offers=[{id:'be-energy',channel:'Direct',scope:{evseId:'evse-a',connectorId:null},
  rawOffer:bePrice,calculationStatus:'not_evaluated'}];
assert.equal(directEnergyPrice([bePrice]).grossEurPerKwh,0.4235);
const beFragment=toFragments(belgium)[0];
assert.equal(beFragment.offers.length,1);
assert.deepEqual(beFragment.offers[0].connectorIds,['plug-a']);
assert.equal(evaluateOffer(beFragment.offers[0],{energyKwh:20,startAt:'2026-10-23T12:00:00Z'}).totalEur,8.47);
for(const mutation of [
  d=>{d.offers[0].rawOffer.priceType='pricePerMinute';},
  d=>{d.offers.push({...d.offers[0],id:'conflicting-rate',rawOffer:{...bePrice,value:0.40}});},
  d=>{d.evses[0].unclassifiedPrices=[{ratePolicy:'contract'}];},
  d=>{d.connectors[0].powerKw=null;},
]){
  const changed=structuredClone(belgium);mutation(changed);
  assert.equal(toFragments(changed)[0].offers.length,0,'unsupported BE rate stays unpriced');
}
const beBytes=new TextEncoder().encode(JSON.stringify(belgium));
const beSha=createHash('sha256').update(beBytes).digest('hex');
const beIndex={schemaVersion:1,status:'prepared',bundleId:'be-test',rejected:[],
  sources:[{source:'BE:nap_static',path:'sources/BE__nap_static.json',sha256:beSha}]};
const beFetch=async url=>({ok:true,arrayBuffer:async()=>
  url.endsWith('index.json')?new TextEncoder().encode(JSON.stringify(beIndex)).buffer:beBytes.buffer});
const bePrepared=await loadPrepared({baseUrl:'http://127.0.0.1/prepared-v9/',origin:'http://127.0.0.1/',
  fetchImpl:beFetch,cryptoImpl:webcrypto,adapter:{toFragments}});
assert.equal((await bePrepared.loaders['prepared:BE:nap_static']())[0].offers.length,1);
const beTampered=await loadPrepared({baseUrl:'http://127.0.0.1/prepared-v9/',origin:'http://127.0.0.1/',
  fetchImpl:beFetch,cryptoImpl:webcrypto,adapter:{toFragments(data){
    const fragments=toFragments(data);fragments[0].offers[0].pricing.rules[0].unknownFee=1;return fragments;
  }}});
await assert.rejects(beTampered.loaders['prepared:BE:nap_static'](),/candidate pricing isolation violated/);
const nlTariff={tariffKey:'NL:ABC:T1',type:'AD_HOC_PAYMENT',countryCode:'NL',partyId:'ABC',
  currency:'EUR',startDateTime:null,endDateTime:null,minPrice:null,maxPrice:null,
  elements:[{restrictions:null,priceComponents:[
    {type:'FLAT',priceInclVat:0,stepSize:0},
    {type:'TIME',priceInclVat:0,stepSize:1},
    {type:'ENERGY',priceInclVat:0.57,stepSize:1000}]}]};
const netherlands={...structuredClone(source),source:{id:'NL:dotnl_static',artifactSha256:'d'.repeat(64)},
  tariffCatalog:{'NL:ABC:T1':nlTariff}};
netherlands.stations[0].country='NL';
netherlands.connectors[0].kind='AC';
netherlands.offers=[{id:'nl-energy',channel:'Direct',scope:{evseId:'evse-a',connectorId:'plug-a'},
  sourceTariffKey:'NL:ABC:T1',rawOffer:{tariffKey:'NL:ABC:T1'},calculationStatus:'not_evaluated'}];
const nlFragment=toFragments(netherlands)[0];
assert.equal(nlFragment.offers.length,1);
assert.equal(evaluateOffer(nlFragment.offers[0],{energyKwh:1.2,startAt:'2026-10-23T12:00:00Z'}).totalEur,1.14,
  'historical DOT-NL 1000 Wh billing oracle');
const datedNl=structuredClone(netherlands);
datedNl.tariffCatalog['NL:ABC:T1'].elements[0].restrictions={start_date:'2026-10-24'};
const datedOffer=toFragments(datedNl)[0].offers[0];
assert.ok(datedOffer,'a documented OCPI start date remains attached to its exact connector');
assert.equal(evaluateOffer(datedOffer,{energyKwh:1.2,startAt:'2026-10-23T12:00:00Z'}).complete,false,
  'future tariff must not be priced early');
assert.equal(evaluateOffer(datedOffer,{energyKwh:1.2,startAt:'2026-10-25T12:00:00Z'}).totalEur,1.14);
const historicalDate=historicalOcpi.tariffPricing({currency:'EUR',elements:[{
  restrictions:{start_date:'2026-10-24'},price_components:[{type:'ENERGY',price:.57,step_size:1000}]
}]});
assert.equal(historicalPricing.evaluateOffer({currency:'EUR',pricing:historicalDate},
  {energyKwh:1.2,startAt:'2026-10-23T12:00:00Z'}).complete,false);
for(const mutation of [
  d=>{d.offers.push({...d.offers[0],id:'another-tariff'});},
  d=>{d.tariffCatalog['NL:ABC:T1'].elements[0].restrictions={min_kwh:2};},
  d=>{d.tariffCatalog['NL:ABC:T1'].elements[0].restrictions={start_date:'2026-02-30'};},
  d=>{d.connectors[0].powerKw=null;},
]){
  const changed=structuredClone(netherlands);mutation(changed);
  assert.equal(toFragments(changed)[0].offers.length,0,'unsupported NL tariff stays unpriced');
}
const compoundNl=structuredClone(netherlands);
compoundNl.tariffCatalog['NL:ABC:T1'].elements[0].priceComponents=[
  {type:'ENERGY',priceInclVat:0.57,stepSize:1000},
  {type:'TIME',priceInclVat:3.6,stepSize:60},
  {type:'FLAT',priceInclVat:1.2,stepSize:0},
  {type:'PARKING_TIME',priceInclVat:1.2,stepSize:300}
];
const compoundOffer=toFragments(compoundNl)[0].offers[0];
const compoundSession={energyKwh:1.2,durationMinutes:55,
  chargingMinutes:43,postChargeMinutes:12,startAt:'2026-10-23T12:00:00Z'};
const compoundQuote=evaluateOffer(compoundOffer,compoundSession);
assert.equal(compoundQuote.totalEur,5.22,
  'OCPI energy step, charging minute, flat fee and parking step must all be billed');
const historicalCompiled=historicalOcpi.tariffPricing({currency:'EUR',elements:[{price_components:[
  {type:'ENERGY',price:0.57,step_size:1000},{type:'TIME',price:3.6,step_size:60},
  {type:'FLAT',price:1.2,step_size:0},{type:'PARKING_TIME',price:1.2,step_size:300}
]}]});
const historicalQuote=historicalPricing.evaluateOffer({...compoundOffer,pricing:historicalCompiled},compoundSession);
assert.equal(compoundQuote.totalEur,historicalQuote.totalEur,
  'candidate compound total must match the historical component engine');
for(const key of ['energy','chargingTime','connectionFee','parkingTime'])
  assert.equal(compoundQuote.components[key],historicalQuote.components[key],`component ${key} parity`);
assert.equal(evaluateOffer(compoundOffer,{energyKwh:1.2,startAt:'2026-10-23T12:00:00Z'}).complete,false,
  'paid time must not disappear when session duration is missing');
for(const mutation of [
  d=>{d.tariffCatalog['NL:ABC:T1'].elements[0].priceComponents.push({type:'TIME',priceInclVat:1,stepSize:60});},
  d=>{d.tariffCatalog['NL:ABC:T1'].elements[0].priceComponents.push({type:'UNKNOWN',priceInclVat:1,stepSize:60});},
  d=>{d.tariffCatalog['NL:ABC:T1'].elements[0].restrictions={start_time:'18:00'};},
]){const changed=structuredClone(compoundNl);mutation(changed);
  assert.equal(toFragments(changed)[0].offers.length,0,'ambiguous or restricted component remains unparsed');}
const compoundBytes=new TextEncoder().encode(JSON.stringify(compoundNl));
const compoundIndex={schemaVersion:1,status:'prepared',bundleId:'nl-compound-test',rejected:[],
  sources:[{source:'NL:dotnl_static',path:'sources/NL__dotnl_static.json',
    sha256:createHash('sha256').update(compoundBytes).digest('hex')}]};
const compoundFetch=async url=>({ok:true,arrayBuffer:async()=>
  url.endsWith('index.json')?new TextEncoder().encode(JSON.stringify(compoundIndex)).buffer:compoundBytes.buffer});
const compoundPrepared=await loadPrepared({baseUrl:'http://127.0.0.1/prepared-v9/',origin:'http://127.0.0.1/',
  fetchImpl:compoundFetch,cryptoImpl:webcrypto,adapter:{toFragments}});
assert.equal((await compoundPrepared.loaders['prepared:NL:dotnl_static']())[0].offers.length,1,
  'compound OCPI recipe reaches the prepared candidate loader');
const compoundTampered=await loadPrepared({baseUrl:'http://127.0.0.1/prepared-v9/',origin:'http://127.0.0.1/',
  fetchImpl:compoundFetch,cryptoImpl:webcrypto,adapter:{toFragments(data){const fragments=toFragments(data);
    fragments[0].offers[0].pricing.rules[0].connectionFee=0;return fragments;}}});
await assert.rejects(compoundTampered.loaders['prepared:NL:dotnl_static'](),/candidate pricing isolation violated/);
const nlBytes=new TextEncoder().encode(JSON.stringify(netherlands));
const nlSha=createHash('sha256').update(nlBytes).digest('hex');
const nlIndex={schemaVersion:1,status:'prepared',bundleId:'nl-test',rejected:[],
  sources:[{source:'NL:dotnl_static',path:'sources/NL__dotnl_static.json',sha256:nlSha}]};
const nlFetch=async url=>({ok:true,arrayBuffer:async()=>
  url.endsWith('index.json')?new TextEncoder().encode(JSON.stringify(nlIndex)).buffer:nlBytes.buffer});
const nlPrepared=await loadPrepared({baseUrl:'http://127.0.0.1/prepared-v9/',origin:'http://127.0.0.1/',
  fetchImpl:nlFetch,cryptoImpl:webcrypto,adapter:{toFragments}});
assert.equal((await nlPrepared.loaders['prepared:NL:dotnl_static']())[0].offers.length,1);
const nlTampered=await loadPrepared({baseUrl:'http://127.0.0.1/prepared-v9/',origin:'http://127.0.0.1/',
  fetchImpl:nlFetch,cryptoImpl:webcrypto,adapter:{toFragments(data){
    const fragments=toFragments(data);fragments[0].offers[0].pricing.rules[0].connectionFee=1;return fragments;
  }}});
await assert.rejects(nlTampered.loaders['prepared:NL:dotnl_static'](),/candidate pricing isolation violated/);
console.log('Canonical V9: proved FR/IT/BE/NL energy rates, exact scope and historic oracles');
