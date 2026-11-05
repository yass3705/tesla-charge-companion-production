import fs from 'node:fs';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),adapter=require('../runtime-owned/assets/v9/adapters/canonical-v9.js'),pricing=require('../runtime-overrides/assets/v9/pricing-engine.js');
const data=JSON.parse(fs.readFileSync(process.argv[2]));const fragments=adapter.toFragments(data);
assert.equal(fragments.flatMap(s=>s.offers).length,data.offers.length);
for(const station of fragments)for(const offer of station.offers){
 const raw=data.offers.find(o=>o.id===offer.id);assert.equal(offer.provider,'Electra');assert.equal(offer.kind,'roaming');
 const result=pricing.evaluateOffer(offer,{energyKwh:10,startAt:'2026-10-15T12:00:00Z'});
 assert.equal(result.complete,true);assert.equal(result.totalEur,raw.rawOffer.mapping.rateEurPerKwh*10);
 assert.ok(station.evses.some(e=>e.id===offer.evseIds[0]&&e.officialEvseId===raw.officialEvseId));
}
for(const mutate of [o=>o.rawOffer.tariff.elements[0].priceComponents.push({type:'FLAT',price:1}),
 o=>o.rawOffer.tariff.elements[0].restrictions.minDuration=600,
 o=>o.rawOffer.tariff.elements[0].priceComponents[0].price=.99,
 o=>o.rawOffer.evidence.screenshotSha256='missing',o=>o.officialEvseId='FR*WRONG',
 o=>o.rawOffer.tariff.unknownFee=2]){
 const changed=structuredClone(data);mutate(changed.offers[0]);const output=adapter.toFragments(changed);
 assert.equal(output.flatMap(s=>s.offers).some(o=>o.id===changed.offers[0].id),false);
 assert.ok(output.flatMap(s=>s.unparsedOffers).some(o=>o.id===changed.offers[0].id));
}
console.log('Archived Electra exact proofs: native identity, energy oracle, changed/extra/unknown fee and missing evidence rejected PASS');
