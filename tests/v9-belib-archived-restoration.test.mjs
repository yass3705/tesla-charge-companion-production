import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {createHash,webcrypto} from 'node:crypto';
const require=createRequire(import.meta.url),adapter=require('../runtime-owned/assets/v9/adapters/canonical-v9.js');
const pricing=require('../runtime-overrides/assets/v9/pricing-engine.js');
const loader=require('../runtime-owned/assets/v9/preproduction-candidate-loader.js');
const engine=require('../runtime-owned/assets/v9/data-engine.js');
const refs=JSON.parse(readFileSync(new URL('./fixtures/v9-belib-archived-profiles.json',import.meta.url)));
const session={energyKwh:10,durationMinutes:30,chargingMinutes:20,postChargeMinutes:10,startAt:'2026-10-15T12:00:00Z'};
const base={schemaVersion:1,source:{id:'FR:belib_stations',artifactSha256:'a'.repeat(64)},cpos:[{id:'c',name:'TotalEnergies',sourceOperatorId:'Total'}],
 stations:[{id:'s',country:'FR',cpoId:'c',sourceStationId:'BELIB',networkBrand:'Belib'}],
 evses:[{id:'e',stationId:'s',cpoId:'c',officialEvseId:'FRV75E1'}],
 connectors:[{id:'p',evseId:'e',powerKw:7,plugType:'Type 2',rawSourceFields:{kind:'AC',serviceClass:'flex'}}],offers:[]};
for(const [id,ref] of Object.entries(refs.profiles)){
 const d=structuredClone(base);d.connectors[0].rawSourceFields.serviceClass=ref.raw.serviceClass;
 d.offers=[{id:'o',channel:'Direct',scope:{evseId:'e',connectorId:'p'},calculationStatus:'not_evaluated',sourceProfileId:id,rawOffer:ref.raw}];
 const f=adapter.toFragments(d)[0],o=f.offers[0];assert.ok(o,id);assert.deepEqual(o.pricing,ref.pricing);
 assert.equal(o.subscriptionId,ref.raw.subscriptionId);assert.deepEqual(o.connectorKinds,['AC']);assert.equal(o.connectorIds,undefined);
 for(const date of ['2026-10-15T12:00:00Z','2026-10-15T19:00:00Z','2026-10-15T22:00:00Z']){
  const q=pricing.evaluateOffer(o,{...session,startAt:date});const oracle=pricing.evaluateOffer({currency:'EUR',metadata:{timeZone:'Europe/Paris'},pricing:ref.pricing},{...session,startAt:date});assert.deepEqual(q.components,oracle.components);assert.equal(q.totalEur,oracle.totalEur);assert.equal(q.complete,true,JSON.stringify({id,q}));
 }
 for(const mutate of [p=>p.longConnectionFee.rounding='up',p=>p.longConnectionFee.thresholdMinutes=null,p=>p.longConnectionFee.basis='parking']){const bad=structuredClone(o);mutate(bad.pricing);assert.equal(pricing.evaluateOffer(bad,session).complete,false);}
 assert.equal(pricing.evaluateOffer(o,{...session,durationMinutes:null}).complete,false);
 assert.equal(pricing.evaluateOffer(o,{...session,durationMinutes:841,chargingMinutes:841,postChargeMinutes:0}).complete,false,'hourly rounding above14h remains unknown');
 for(const mutate of [x=>x.offers[0].rawOffer.extraFee=1,x=>x.offers[0].rawOffer.rules[0].energyEurPerKwh=.123,x=>x.evses[0].officialEvseId=null,x=>x.connectors[0].rawSourceFields.serviceClass='other']){const bad=structuredClone(d);mutate(bad);assert.equal(adapter.toFragments(bad)[0].offers.length,0);}
 const national=structuredClone(f);national.canonicalId='national';national.evses[0].id='NE';national.evses[0].connectors[0].id='NC';national.offers=[];national.unparsedOffers=[];
 const con=engine.consolidateNational([{source:{id:'prepared:FR:irve_static'},fragment:national},{source:{id:'prepared:FR:belib_stations'},fragment:f}],{FR:'FR:irve_static'});
 const attached=con.items.find(x=>x.fragment.offers.length);assert.deepEqual(attached.fragment.offers[0].evseIds,['NE']);assert.equal(con.diagnostics.matchedOffers,1);
 const raw=JSON.stringify(d),sha=v=>createHash('sha256').update(v).digest('hex');const index={schemaVersion:1,bundleId:'fixture',status:'prepared',sources:[{source:d.source.id,path:'sources/FR__belib_stations.json',sha256:sha(raw)}],rejected:[]};
 const loaded=await loader.loadPrepared({baseUrl:'https://fixture.invalid/data',origin:'https://fixture.invalid',nationalCatalogues:{},cryptoImpl:webcrypto,adapter,fetchImpl:async u=>new Response(new URL(u).pathname.endsWith('index.json')?JSON.stringify(index):raw)});assert.equal((await loaded.loaders['prepared:FR:belib_stations']({}))[0].offers.length,1);
}
if(process.argv[2]){
 const d=JSON.parse(readFileSync(process.argv[2]));const fs=adapter.toFragments(d);let count=0;
 for(const f of fs)for(const o of f.offers){const q=pricing.evaluateOffer(o,session);assert.equal(q.complete,true);count++;}
 console.log(JSON.stringify({archive:'PASS',offers:count,profiles:Object.keys(refs.profiles).length}));
}
console.log('Belib whole archived profiles, blocks, windows, subscriptions, national exact scope and unknown fee guards PASS');
