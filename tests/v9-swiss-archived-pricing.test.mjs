import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash,webcrypto} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const require=createRequire(import.meta.url),adapter=require('../runtime-owned/assets/v9/adapters/canonical-v9.js');
const {evaluateOffer}=require('../runtime-overrides/assets/v9/pricing-engine.js');
const {loadPrepared}=require('../runtime-owned/assets/v9/preproduction-candidate-loader.js');
const session={energyKwh:10,durationMinutes:60,chargingMinutes:60,postChargeMinutes:0,startAt:'2026-10-15T12:00:00Z'};
const base={schemaVersion:1,source:{id:'CH:swiss_integration',artifactSha256:'a'.repeat(64)},cpos:[{id:'c',name:'Migrol',sourceOperatorId:'CH*MIG'}],
 stations:[{id:'s',country:'CH',cpoId:'c',sourceStationId:'CH*MIG*P*1'}],evses:[{id:'e',cpoId:'c',stationId:'s',officialEvseId:'CH*MIG*E*1'}],
 connectors:[{id:'p',evseId:'e',powerKw:22,plugType:'Type 2 Outlet',rawFacility:{powertype:'AC_3_PHASE'}}],
 offers:[{id:'o',channel:'Direct',calculationStatus:'not_evaluated',scope:{evseId:'e',connectorId:null},sourceEvseId:'CH*MIG*E*1',sourceFile:'data/switzerland/migrol-official-direct-tariffs.json',
 rawOffer:{evseId:'CH*MIG*E*1',chargingStationId:'CH*MIG*P*1',maxPowerKw:22,currency:'CHF',pricePerKwh:.38,pricePerMinute:0,startFee:0,source:'Migrol official M-Charge national public tariff schedule'}}]};
const ec=structuredClone(base);ec.offers[0].sourceFile='data/switzerland/ecarup-owner-direct-tariffs.json';ec.offers[0].rawOffer={evseId:'CH*MIG*E*1',classification:'priced_public_direct',nationalRecord:{EvseID:'CH*MIG*E*1'},
 ecarup:{hubjectId:'CH*MIG*E*1',accessType:0,maxPowerW:22000,price:{Currency:'chf',EnergyPrice:.5,ParkingPrice:0,PenaltyGracePeriodMinutes:null,PenaltyMaxFee:null,PenaltyPricePerMinute:null,SpecialUserEnergyPrice:null,SpecialUserParkingPrice:null}}};
for(const d of [base,ec]){
 const fragment=adapter.toFragments(d)[0],offer=fragment.offers[0];assert.ok(offer);assert.equal(fragment.evses[0].connectors[0].kind,'AC');
 const result=evaluateOffer(offer,session);assert.equal(result.complete,true);assert.equal(result.currency,'CHF');
 const legacy=spawnSync('python3',['-c',`import sys,json;sys.path.insert(0,'scripts');import build_switzerland_v9 as h\nh.CHF_PER_EUR=1;h.FX_DATE='fixture';h.EVSE_META={'CH*MIG*E*1':{'kind':'AC','powerKw':22}};h.EVSE_NORM={}\nr=h.simple_evse_offer(json.load(sys.stdin),'fixture','archive');print(json.dumps(r[0]['pricing']))`],{input:JSON.stringify(d.offers[0].rawOffer),encoding:'utf8'});
 assert.equal(legacy.status,0,legacy.stderr);assert.equal(result.totalEur,evaluateOffer({currency:'CHF',pricing:JSON.parse(legacy.stdout)},session).totalEur,'identical source input against preserved historical transformation, FX identity only in oracle');
 const raw=JSON.stringify(d),sha=v=>createHash('sha256').update(v).digest('hex');
 const index={schemaVersion:1,bundleId:'fixture',status:'prepared',sources:[{source:d.source.id,path:'sources/CH__swiss_integration.json',sha256:sha(raw)}],rejected:[]};
 const cfg={nationalCatalogues:{},baseUrl:'https://fixture.invalid/data',origin:'https://fixture.invalid',cryptoImpl:webcrypto,adapter,fetchImpl:async url=>new Response(new URL(url).pathname.endsWith('index.json')?JSON.stringify(index):raw)};
 const loaded=await loadPrepared(cfg);assert.equal((await loaded.loaders['prepared:CH:swiss_integration']({}))[0].offers.length,1);
 for(const mutate of [x=>x.offers[0].sourceEvseId='OTHER',x=>x.connectors[0].powerKw=23,x=>x.offers[0].sourceFile='data/switzerland/ecarup-owner-coordinate-safe-overlay.json']){
  const bad=structuredClone(d);mutate(bad);assert.equal(adapter.toFragments(bad)[0].offers.length,0);
 }
}
for(const key of ['ParkingPrice','PenaltyPricePerMinute','SpecialUserEnergyPrice']){
 const bad=structuredClone(ec);bad.offers[0].rawOffer.ecarup.price[key]=.1;assert.equal(adapter.toFragments(bad)[0].offers.length,0,'unknown/billable fee cannot be omitted');
}
const extraEc=structuredClone(ec);extraEc.offers[0].rawOffer.ecarup.connectionFee=1;assert.equal(adapter.toFragments(extraEc)[0].offers.length,0);
const extra=structuredClone(base);extra.offers[0].rawOffer.afterMinutesFee=.2;assert.equal(adapter.toFragments(extra)[0].offers.length,0);
if(process.argv[2]){
 const d=JSON.parse(fs.readFileSync(path.join(path.resolve(process.argv[2]),'CH__swiss_integration.json'))),fragments=adapter.toFragments(d);let count=0;const sources={};
 const originals=new Map(d.offers.map(o=>[o.id,o]));
 for(const st of fragments)for(const o of st.offers){const raw=originals.get(o.id);const rate=raw.rawOffer.pricePerKwh??raw.rawOffer.ecarup.price.EnergyPrice;const q=evaluateOffer(o,session);assert.equal(q.complete,true);assert.equal(q.currency,'CHF');assert.ok(Math.abs(q.totalEur-10*rate)<1e-8);count++;sources[raw.sourceFile]=(sources[raw.sourceFile]||0)+1;}
 console.log(JSON.stringify({archiveTest:'PASS',offers:count,sources}));
}
console.log('Swiss exact archive parity, CHF, explicit AC/DC, SHA loader and incomplete-fee rejection PASS');
