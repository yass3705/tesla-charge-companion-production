import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {createHash,webcrypto} from 'node:crypto';
const require=createRequire(import.meta.url),adapter=require('../runtime-owned/assets/v9/adapters/canonical-v9.js');
const pricing=require('../runtime-overrides/assets/v9/pricing-engine.js');
const loader=require('../runtime-owned/assets/v9/preproduction-candidate-loader.js');
const base=JSON.parse(readFileSync(new URL('./fixtures/v9-ubitricity-archived-connector.json',import.meta.url)));
const session={energyKwh:10,durationMinutes:30,chargingMinutes:30,postChargeMinutes:0,startAt:'2026-10-20T12:00:00Z'};
const fragment=adapter.toFragments(base)[0],offer=fragment.offers[0];assert.ok(offer);
assert.deepEqual(offer.pricing,base.offers[0].archivedCompiledOffer.pricing);
assert.deepEqual(offer.evseIds,[base.evses[0].id]);assert.deepEqual(offer.connectorIds,[base.connectors[0].id]);
// Independent arithmetic from the archived four public VAT-inclusive bands.
for(const [startAt,total] of [['2026-10-20T04:00:00Z',4.5],['2026-10-20T12:00:00Z',5.6],['2026-10-20T16:00:00Z',6.7],['2026-10-20T21:00:00Z',5.6],['2026-10-20T05:45:00Z',5.05]]){
 const q=pricing.evaluateOffer(offer,{...session,startAt});assert.equal(q.complete,true);assert.ok(Math.abs(q.totalEur-total)<1e-8,JSON.stringify(q));
}
const idle=pricing.evaluateOffer(offer,{...session,durationMinutes:105,postChargeMinutes:75});assert.equal(idle.complete,true);assert.ok(Math.abs(idle.totalEur-6.35)<1e-8);
const night=pricing.evaluateOffer(offer,{...session,startAt:'2026-10-20T21:00:00Z',durationMinutes:105,postChargeMinutes:75});assert.ok(Math.abs(night.totalEur-5.6)<1e-8);
for(const mutate of [d=>d.offers[0].scope.connectorId='missing',d=>d.evses[0].officialEvseId='other',d=>d.offers[0].archivedCompiledOffer.metadata.tariffId='other',d=>d.source.generatedAt='2026-11-01T00:00:00Z',d=>d.offers[0].archivedCompiledOffer.pricing.extraFee=1,d=>d.offers[0].archivedCompiledOffer.pricing.postChargeFee.graceMinutes=0,d=>d.offers[0].calculationHold='unproved']){
 const d=structuredClone(base);mutate(d);assert.equal(adapter.toFragments(d)[0].offers.length,0);
}
const raw=JSON.stringify(base),sha=s=>createHash('sha256').update(s).digest('hex');
const index={schemaVersion:1,bundleId:'fixture',status:'prepared',rejected:[],sources:[{source:base.source.id,path:'sources/GB__ubitricity_pcpr_direct.json',sha256:sha(raw)}]};
const cfg={baseUrl:'https://fixture.invalid/data',origin:'https://fixture.invalid',cryptoImpl:webcrypto,adapter,fetchImpl:async u=>new Response(new URL(u).pathname.endsWith('index.json')?JSON.stringify(index):raw)};
const loaded=await loader.loadPrepared(cfg);assert.equal((await loaded.loaders['prepared:'+base.source.id]({}))[0].offers.length,1);
const forged={...adapter,toFragments:d=>{const f=adapter.toFragments(d);f[0].offers[0].pricing.rules[0].pricePerKwh=0;return f;}};
const bad=await loader.loadPrepared({...cfg,adapter:forged});await assert.rejects(bad.loaders['prepared:'+base.source.id]({}),/pricing isolation violated/);
if(process.argv[2]){
 const d=JSON.parse(readFileSync(process.argv[2]));const refs=new Map(d.offers.filter(o=>o.archivedCompiledOffer).map(o=>[o.id,o.archivedCompiledOffer]));let count=0;
 for(const f of adapter.toFragments(d))for(const o of f.offers){assert.deepEqual(o.pricing,refs.get(o.id).pricing);for(const s of [session,{...session,durationMinutes:105,postChargeMinutes:75},{...session,startAt:'2026-10-25T00:45:00Z'}]){const q=pricing.evaluateOffer(o,s),oracle=pricing.evaluateOffer(refs.get(o.id),s);assert.equal(q.complete,oracle.complete);assert.deepEqual(q.components,oracle.components);assert.equal(q.totalEur,oracle.totalEur);}count++;}
 assert.equal(count,refs.size);console.log(JSON.stringify({identicalArchivedOffers:count,scenariosPerOffer:3,status:'PASS'}));
}
console.log('UK archived connector scope, first-match compiled pricing, VAT, windows, idle, DST and signed-loader guard PASS');
