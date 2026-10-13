import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const adapter=require('../runtime-overrides/assets/v9/adapters/energyvision-belgium.js');
const rate={sourceRateId:'station-ad-hoc-1',ratePolicy:'adHoc',currency:'EUR',
 sourceLastUpdated:'2026-04-02T11:00:00Z',priceComponents:[{
 priceType:'pricePerKWh',amountSource:'0.38',taxIncluded:'true',taxRateSource:'21',
 rawApplicabilityLeaves:[{path:'energyPrice/value',value:'0.38'}]}]};
const point=(id,status='available')=>({externalEvseId:id,sourcePointId:id+':source',
 connectorType:'TYPE2',powerW:22000,status,sourcePointEnergyRateCount:0,
 priceable:false,publicAccessVerified:false});
const site=()=>({sourceSiteId:'site1',name:'EnergyVision',city:'Ghent',postalCode:'9051',
 latitude:51.05,longitude:3.71,sourceSiteType:'openSpace',sourceSiteEnergyRateCount:0,
 stations:[{sourceStationId:'station1',sourceStationEnergyRateCount:1,
 sourceStationRatesUnassignedToPdc:[rate],pdc:[point('BE*NRG*P1'),point('BE*NRG*P2','unknown')]}]});
const payload=()=>({provider:'EnergyVision',country:'BE',v9PublicationReady:false,
 v9PricedPDC:0,sourceSha256:'a'.repeat(64),napCrosswalk:{unmatchedIds:3795},
 counts:{sourcePDC:3795,distinctExternalEvseIds:3795},sites:[site()]});
const verified=adapter.normalizePayload(payload());
assert.equal(verified.length,1);
assert.equal(verified[0].evses.length,1,'Unknown or nonoperational PDC excluded');
assert.equal(verified[0].offers.length,1);
assert.equal(verified[0].offers[0].evseIds[0],'BE*NRG*P1');
assert.equal(verified[0].offers[0].pricing.rules[0].pricePerKwh,0.38);
assert.equal(verified[0].offers[0].pricing.rules[0].chargePerMinute,0);
assert.equal(verified[0].offers[0].pricing.rules[0].connectionFee,0);
assert.equal(verified[0].offers[0].pricing.rules[0].afterMinutesRate,0);
assert.equal(adapter.normalizePayload(payload(),{bounds:{minLat:50,maxLat:51,minLon:3,maxLon:4}}).length,0);
const changed=mut=>{const x=payload();mut(x);return adapter.normalizePayload(x)[0];};
for(const mutate of [
 x=>x.sites[0].sourceSiteEnergyRateCount=1,
 x=>x.sites[0].stations[0].sourceStationEnergyRateCount=2,
 x=>x.sites[0].stations[0].pdc[0].sourcePointEnergyRateCount=1,
 x=>x.sites[0].stations[0].sourceStationRatesUnassignedToPdc[0].priceComponents.push({priceType:'pricePerMinute',amountSource:'0.05'}),
 x=>x.sites[0].stations[0].sourceStationRatesUnassignedToPdc[0].priceComponents[0].taxIncluded='false',
 x=>x.sites[0].stations[0].sourceStationRatesUnassignedToPdc[0].priceComponents[0].rawApplicabilityLeaves.push({path:'energyPrice/timeBasedApplicability/fromMinute',value:'45'}),
 x=>x.sites[0].stations[0].pdc.push({...point('BE*NRG*P3'),powerW:7000})
]){
 assert.equal(changed(mutate).offers.length,0,'No incomplete or ambiguous rate is priceable');
}
assert.throws(()=>adapter.normalizePayload({...payload(),v9PublicationReady:true}),/Unverified/);
assert.throws(()=>adapter.normalizePayload({...payload(),napCrosswalk:{unmatchedIds:3794}}),/Unverified/);
assert.throws(()=>adapter.normalizePayload({...payload(),sourceSha256:''}),/Unverified/);
assert.throws(()=>adapter.normalizePayload({...payload(),sites:[{...site(),stations:[{...site().stations[0],pdc:[point('BE*NRG*P1'),point('BE*NRG*P1')]}]}]}),/duplicated/);
if(process.argv[2]){
  const fs=await import('node:fs');
  const path=await import('node:path');
  const zlib=await import('node:zlib');
  const srcPath=path.join(process.argv[2],'snapshot-inputs/BE/energyvision-official.json.gz');
  const raw=JSON.parse(zlib.gunzipSync(fs.readFileSync(srcPath)));
  const sites=adapter.normalizePayload(raw);
  const pdc=sites.reduce((n,site)=>n+site.evses.length,0);
  const offers=sites.reduce((n,site)=>n+site.offers.length,0);
  assert.equal(raw.counts.sourcePDC,3795);
  assert.equal(raw.counts.unassignedStationRates,1228);
  assert.equal(raw.napCrosswalk.unmatchedIds,3795);
  assert.equal(pdc,raw.counts.activePDC);
  assert.equal(offers,776,'Only exact operational, homogeneous single-component direct CPO rates');
  assert.ok(sites.every(s=>s.countryCode==='BE'&&s.physicalOperator.name==='EnergyVision'));
  assert.ok(sites.flatMap(s=>s.offers).every(o=>o.kind==='direct'&&o.provider==='EnergyVision'&&o.evseIds.length===1));
  console.log('EnergyVision official pinned CPO runtime:',{sites:sites.length,pdc,offers});
}
console.log('EnergyVision public CPO 22-kW PDC, no double price, source guards: PASS');
