import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {createHash,webcrypto} from 'node:crypto';
const require=createRequire(import.meta.url),adapter=require('../runtime-owned/assets/v9/adapters/canonical-v9.js'),pricing=require('../runtime-overrides/assets/v9/pricing-engine.js');
// Historical scripts/allego_normalize_v8.py: fee only after charge stops AND
// session minute45, not a 45-minute grace period after charge completion.
const d={schemaVersion:1,source:{id:'FR:allego_direct',artifactSha256:'a'.repeat(64)},cpos:[{id:'c',name:'Allego',sourceOperatorId:'Allego'}],stations:[{id:'s',country:'FR',cpoId:'c',sourceStationId:'s'}],evses:[{id:'e',stationId:'s',cpoId:'c',officialEvseId:'FRALLEGO1'}],connectors:[{id:'p',evseId:'e',powerKw:150,plugType:'CCS'}],offers:[{id:'o',channel:'Direct',calculationStatus:'not_evaluated',scope:{evseId:'e',connectorId:null},rawOffer:{conditionalOffers:[],directEurPerKwh:.59,rankableDirectInArchive:true,sourceEvseId:'FRALLEGO1',feePolicy:{type:'idle_after_charging',ratePerMinuteEur:.248,notBeforeSessionMinute:45,onlyAfterChargingStops:true,source:'https://www.allego.eu/fr/overstay-fee/'}}}]};
d.evses[0].rawSourceFields={evseId:'FRALLEGO1',kind:'DC',powerKw:150,isOwnNetwork:true,rankableDirect:true,feeModelExact:true,blockingReason:null,directEurPerKwh:.59,feePolicy:structuredClone(d.offers[0].rawOffer.feePolicy)};
const o=adapter.toFragments(d)[0].offers[0];assert.ok(o);
const raw=JSON.stringify(d),sha=v=>createHash('sha256').update(v).digest('hex');const index={schemaVersion:1,bundleId:'fixture',status:'prepared',sources:[{source:d.source.id,path:'sources/FR__allego_direct.json',sha256:sha(raw)}],rejected:[]};
const loaded=await require('../runtime-owned/assets/v9/preproduction-candidate-loader.js').loadPrepared({baseUrl:'https://fixture.invalid/data',origin:'https://fixture.invalid',nationalCatalogues:{},cryptoImpl:webcrypto,adapter,fetchImpl:async u=>new Response(new URL(u).pathname.endsWith('index.json')?JSON.stringify(index):raw)});assert.equal((await loaded.loaders['prepared:FR:allego_direct']({}))[0].offers.length,1);

for(const [charge,post] of [[20,40],[50,10],[60,0],[10,10],[45,1]]){
 const q=pricing.evaluateOffer(o,{energyKwh:10,durationMinutes:charge+post,chargingMinutes:charge,postChargeMinutes:post});
 assert.equal(q.complete,true);assert.equal(q.totalEur,Math.round((5.9+Math.max(0,charge+post-Math.max(45,charge))*.248)*1e6)/1e6);
}
assert.equal(pricing.evaluateOffer(o,{energyKwh:10,durationMinutes:60}).complete,false);
for(const mutate of [x=>x.offers[0].rawOffer.conditionalOffers=[{discount:1}],x=>x.offers[0].rawOffer.feePolicy.cap=1,x=>x.offers[0].rawOffer.feePolicy.onlyAfterChargingStops=false,x=>x.evses[0].officialEvseId='OTHER',x=>x.evses[0].rawSourceFields.powerKw=22]){const bad=structuredClone(d);mutate(bad);assert.equal(adapter.toFragments(bad)[0].offers.length,0);}
if(process.argv[2]){const a=JSON.parse(readFileSync(process.argv[2]));let count=0;for(const st of adapter.toFragments(a))for(const offer of st.offers){const q=pricing.evaluateOffer(offer,{energyKwh:10,durationMinutes:60,chargingMinutes:20,postChargeMinutes:40});assert.equal(q.complete,true);count++;}console.log(JSON.stringify({archive:'PASS',offers:count}));}
console.log('Allego archived exact EVSE energy + idle after minute45, no fee loss PASS');
