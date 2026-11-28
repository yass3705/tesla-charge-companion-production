import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const [, , bundle,site]=process.argv;
if(!bundle)throw Error('Métropolis candidate bundle path required');
const adapter=require(site?path.resolve(site,'runtime/assets/v9/adapters/canonical-v9.js'):'../runtime-owned/assets/v9/adapters/canonical-v9.js');
const pricing=require(site?path.resolve(site,'runtime/assets/v9/pricing-engine.js'):'../runtime-overrides/assets/v9/pricing-engine.js');
const data=JSON.parse(fs.readFileSync(path.join(bundle,'FR__metropolis_official.json'),'utf8'));
const rawById=new Map(data.offers.map(offer=>[offer.id,offer.rawOffer]));
const stations=adapter.toFragments(data);
const offers=stations.flatMap(row=>row.offers);
assert.equal(offers.length,data.offers.length,'every admitted exact scope retains its reviewed pricing');
const session={startAt:'2026-11-28T17:45:00Z',chargingMinutes:60,durationMinutes:60,energyKwh:10.1,postChargeMinutes:20};
for(const offer of offers){
  const raw=rawById.get(offer.id);
  const expected=11*raw.energyEurPerKwh+(raw.postChargeSchedule?1.5:10*raw.postChargeEurPerMinute);
  const quote=pricing.evaluateOffer(offer,session);
  assert.equal(quote.complete,true);
  assert.ok(Math.abs(quote.totalEur-expected)<1e-6);
  assert.equal(pricing.evaluateOffer(offer,{...session,postChargeMinutes:null}).complete,false);
}
const candidates=[];
for(const kind of [false,true]){
  const station=stations.find(s=>s.offers.some(offer=>Boolean(rawById.get(offer.id).postChargeSchedule)===kind));
  const offer=station.offers.find(o=>Boolean(rawById.get(o.id).postChargeSchedule)===kind);
  const point=station.evses.find(e=>offer.evseIds.includes(e.id));
  candidates.push({source:data.source.id,country:'FR',provider:offer.provider,stationId:station.canonicalId,
    evseId:point.officialEvseId,offerId:offer.id,name:station.name,latitude:station.latitude,longitude:station.longitude});
}
const damaged=structuredClone(data);
damaged.offers[0].rawOffer.id_station_itinerance+='-other';
assert.equal(adapter.toFragments(damaged).flatMap(s=>s.offers).length,offers.length-1);
console.log(JSON.stringify({count:offers.length,cases:candidates}));
