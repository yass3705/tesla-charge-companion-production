import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const [, , bundle, site]=process.argv;
if(!bundle)throw Error('Verified candidate bundle path required');
const pricing=require(site?path.resolve(site,'runtime/assets/v9/pricing-engine.js'):'../runtime-overrides/assets/v9/pricing-engine.js');
const adapter=require(site?path.resolve(site,'runtime/assets/v9/adapters/canonical-v9.js'):'../runtime-owned/assets/v9/adapters/canonical-v9.js');
const cases=[];
const counts={};
for(const [key,total,provider] of [['ewd_official',6.8,'EWD Direct'],['fastned_official',7.5,'Fastned Standard']]){
  const data=JSON.parse(fs.readFileSync(path.join(bundle,'CH__'+key+'.json'),'utf8'));
  const fragments=adapter.toFragments(data),source=data.source.id;
  assert.equal(fragments.flatMap(s=>s.offers).length,data.offers.length);
  const session={energyKwh:10,durationMinutes:30,chargingMinutes:30,postChargeMinutes:0,startAt:'2026-11-28T14:00:00Z'};
  for(const station of fragments)for(const offer of station.offers){
    assert.equal(offer.evseIds.length,1);
    assert.equal(offer.provider,provider);
    const quote=pricing.evaluateOffer(offer,session);
    assert.equal(quote.complete,true);
    assert.equal(quote.currency,'CHF');
    assert.equal(quote.totalEur,total);
  }
  const st=fragments.find(s=>Number.isFinite(s.latitude)&&Number.isFinite(s.longitude)&&s.offers.length);
  assert(st,'Swiss browser fixture requires national coordinates');
  const offer=st.offers[0],evse=st.evses.find(e=>e.id===offer.evseIds[0]);
  cases.push({country:'CH',provider,source,stationId:st.canonicalId,evseId:evse.officialEvseId,
    offerId:offer.id,currency:'CHF',latitude:st.latitude,longitude:st.longitude,name:st.name});
  counts[source]=data.offers.length;
}
console.log(JSON.stringify({cases,counts}));
