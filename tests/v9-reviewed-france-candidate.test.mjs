import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const [, , bundle, site]=process.argv;
if(!bundle)throw Error('Verified candidate bundle path required');
const read=name=>JSON.parse(fs.readFileSync(path.join(bundle,name),'utf8'));
const pricing=require(site?path.resolve(site,'runtime/assets/v9/pricing-engine.js'):'../runtime-overrides/assets/v9/pricing-engine.js');
const adapter=require(site?path.resolve(site,'runtime/assets/v9/adapters/canonical-v9.js'):'../runtime-owned/assets/v9/adapters/canonical-v9.js');
const borne=read('FR__labornebleue_direct.json');
const driveco=read('FR__driveco_evse_tariffs.json');
const fragments=adapter.toFragments(borne);
const priced=fragments.flatMap(station=>station.offers);
assert.equal(priced.length,borne.offers.filter(o=>!o.calculationHold).length);
assert.equal(fragments.flatMap(s=>s.unparsedOffers).length,borne.offers.filter(o=>o.calculationHold).length);
const raw=adapter.toFragments(driveco);
assert.equal(raw.flatMap(station=>station.offers).length,0);
assert.equal(raw.flatMap(station=>station.unparsedOffers).length,driveco.offers.length);
assert(driveco.offers.every(o=>o.rawOffer.feeSemantics.safeForFullSessionCost===false));
const sourceRows=new Map(borne.offers.map(r=>[r.id,r]));
const sample=fragments.find(st=>st.offers.some(o=>sourceRows.get(o.id).rawOffer.powerKw<=7.4&&!o.subscriptionId));
const direct=sample.offers.find(o=>sourceRows.get(o.id).rawOffer.powerKw<=7.4&&!o.subscriptionId);
const sub=sample.offers.find(o=>o.evseIds[0]===direct.evseIds[0]&&o.subscriptionId==='labornebleue-annual');
assert.equal(sub.metadata.annualFeeEur,10);
const closer=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const compute=(offer,startAt,minutes,chargingMinutes=30)=>{
    const result=pricing.evaluateOffer(offer,{startAt,durationMinutes:minutes,chargingMinutes,energyKwh:2,postChargeMinutes:minutes-chargingMinutes});
    assert.equal(result.complete,true,JSON.stringify(result));
    return result;
};
closer(compute(direct,'2026-11-28T18:30:00Z',60).totalEur,4);
closer(compute(direct,'2026-03-29T00:00:00Z',420).totalEur,25.5);
closer(compute(direct,'2026-10-24T23:00:00Z',540).totalEur,32.5);
const capped=compute(sub,'2026-11-28T18:30:00Z',390);
closer(capped.totalEur,13.75);
assert.equal(capped.components.afterMinutes.nightWindowCount,1);
assert.equal(pricing.evaluateOffer(sub,{startAt:'2026-11-28T18:30:00Z',durationMinutes:1500}).reason,'multiple_night_caps_require_source_confirmation');
assert.equal(pricing.evaluateOffer(sub,{startAt:'2026-11-28T18:30:00Z'}).complete,false);
const national=read('FR__irve_static.json');
const nat=new Map(national.evses.map(e=>[e.id,e]));
for(const o of priced)assert.equal(nat.get(o.evseIds[0]).officialEvseId,o.metadata.sourceEvseId);
const natByOfficial=new Map(national.evses.map(e=>[e.officialEvseId,e]));
const stations=new Map(national.stations.map(s=>[s.id,s]));
const drivecoCase=driveco.offers.find(o=>{
 const evse=natByOfficial.get(o.sourceEvseId);
 return evse&&stations.get(evse.stationId).publicAccessDecision!=='exclude_non_public';
});
assert(drivecoCase);
const d=stations.get(natByOfficial.get(drivecoCase.sourceEvseId).stationId);
console.log(JSON.stringify({borneOffers:priced.length,drivecoRaw:driveco.offers.length,
  sessions:{crossingWindows:4,springDST:25.5,autumnDST:32.5,subscriberCap:13.75},
  cases:[{source:'FR:labornebleue_direct',stationId:sample.canonicalId,name:sample.name,latitude:sample.latitude,longitude:sample.longitude,
          evseId:direct.metadata.sourceEvseId,offerId:direct.id,subscriptionId:sub.subscriptionId},
    {source:'FR:driveco_evse_tariffs',stationId:d.id,name:d.name||d.sourceStationId,latitude:d.latitude,longitude:d.longitude,
          evseId:drivecoCase.sourceEvseId,rawOfferId:drivecoCase.id}]}));
