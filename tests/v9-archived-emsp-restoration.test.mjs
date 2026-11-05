import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {toFragments}=require('../runtime-owned/assets/v9/adapters/canonical-v9.js');
const {evaluateOffer}=require('../runtime-overrides/assets/v9/pricing-engine.js');
function fixture(channel='Electroverse'){
 const mode=channel==='Electra'?'exact_national_irve_evse':'exact_unique_national_irve_pdc';
 return{schemaVersion:1,source:{id:channel==='Electra'?'FR:electra_emsp_exact':'FR:emsp_exact',artifactSha256:'a'.repeat(64),nationalSha256:'b'.repeat(64),archiveManifestSha256:'c'.repeat(64),identityContract:'historical_normalized_official_evse_unique'},
 cpos:[{id:'c',sourceOperatorId:'original-cpo'}],stations:[{id:'s',country:'FR',cpoId:'c',sourceStationId:'original-site'}],
 evses:[{id:'e',stationId:'s',officialEvseId:'FRABCE1'}],connectors:[{id:'p',evseId:'e',powerKw:22}],
 offers:[{id:'o',channel,scope:{evseId:'e',connectorId:null},sourceOfferId:'raw',sourceEvseId:'FR*ABC*E1',officialEvseId:'FRABCE1',proof:'archived_unique_normalized_official_evse',calculationStatus:'not_evaluated',rawOffer:{id:'raw',provider:channel,currency:'EUR',evseIds:['FR*ABC*E1'],verifiedScope:'exact_evse',metadata:{verified:true,verifiedScope:'exact_evse',identityMode:mode},pricing:{type:'rules',rules:[{scope:'allDay',start:'00:00',end:'24:00',billing:'kwh',currency:'EUR',pricePerKwh:.5,chargePerMinute:.1,idlePerMinute:.2,connectionFee:1}]}}}]};
}
const session={energyKwh:10,chargingMinutes:20,postChargeMinutes:5,durationMinutes:25,startAt:'2026-10-15T12:00:00Z'};
for(const channel of ['Electra','Electroverse']){
 const d=fixture(channel),before=JSON.stringify(d),f=toFragments(d)[0],o=f.offers[0];
 assert.equal(o.provider,channel);assert.equal(o.kind,'roaming');assert.deepEqual(o.evseIds,['e']);assert.deepEqual(o.connectorIds,['p']);
 assert.deepEqual(o.pricing,d.offers[0].rawOffer.pricing);assert.equal(JSON.stringify(d),before);
 assert.equal(evaluateOffer(o,session).totalEur,9,'energy5 + charging2 + parking1 + fixed1, independent arithmetic');
 for(const mutate of [x=>x.offers[0].sourceEvseId='FR*OTHER*E1',x=>x.offers[0].calculationHold='unpreserved_source_restrictions',x=>x.offers[0].rawOffer.metadata.identityMode='curated_irve_location',x=>x.source.archiveManifestSha256='wrong',x=>x.offers[0].rawOffer.pricing.rules[0].currency='GBP']){
  const bad=structuredClone(d);mutate(bad);const f=toFragments(bad)[0];assert.equal(f.offers.length,0);assert.equal(f.unparsedOffers.length,1);
 }
 const unknown=structuredClone(d);unknown.offers[0].rawOffer.pricing.rules[0].unknownConnectionFee=2;
 assert.equal(evaluateOffer(toFragments(unknown)[0].offers[0],session).complete,false,'unknown component cannot yield a partial classified price');
 const window=structuredClone(d);window.offers[0].rawOffer.pricing.rules.push({...window.offers[0].rawOffer.pricing.rules[0],scope:'timeWindow',start:'13:00',end:'18:00',pricePerKwh:.3});
 assert.equal(evaluateOffer(toFragments(window)[0].offers[0],session).totalEur,7,'France local time selects preserved window');
 assert.equal(evaluateOffer(o,{...session,postChargeMinutes:null}).complete,false,'missing post-charge duration fails closed');
}
console.log('Archived eMSP normalization, scope, combined fees, time windows and fail-closed components: PASS');
