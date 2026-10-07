import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const root=path.resolve(process.argv[2]);
const pricing=require(path.join(root,'runtime/assets/v9/pricing-engine.js'));
const sessionEngine=require(path.join(root,'runtime/assets/v9/session-engine.js'));
const adapter=require(path.join(root,'runtime/assets/v9/adapters/uk-open-feeds.js'));
const shell=require(path.join(root,'v9-production-shell/bridge.js'));
const payload=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,'snapshot-inputs/UK/all.json.gz'))));
const source=payload.sources.find(s=>s.id==='connected-kerb-guest');
assert(source);
const stations=adapter.normalizePayload({sources:[source]});
const offers=stations.flatMap(s=>s.offers);
assert.equal(stations.length,2069);
assert.equal(offers.length,7999);
const profiles=new Map();
for(const o of offers){
  assert.equal(o.currency,'GBP');assert.equal(o.pricing.timeZone,'UTC');
  profiles.set(JSON.stringify(o.pricing),o);
}
for(const o of profiles.values()){
  for(let minute=0;minute<1440;minute++){
    const matches=o.pricing.rules.filter(r=>pricing.ruleContains(r,minute));
    assert(matches.length>0,`Missing window ${o.id} ${minute}`);
    assert.equal(new Set(matches.map(r=>r.pricePerKwh)).size,1,`Conflicting prices ${o.id} ${minute}`);
  }
}
const peregrine=offers.find(o=>o.evseIds.includes('GB*CK0*E27099'));
assert(peregrine);
for(const date of ['2026-07-07','2026-12-07']){
  for(const [clock,expected] of [['05:59',0.42996],['06:00',0.53004],['22:59',0.53004],['23:00',0.42996]]){
    for(const timeZone of ['UTC','Europe/London','Europe/Paris']){
      const result=pricing.evaluateOffer(peregrine,{startAt:`${date}T${clock}:00Z`,timeZone,energyKwh:1,durationMinutes:0});
      assert(result.complete);assert.equal(result.totalEur,expected);assert.equal(result.timeZone,'UTC');
    }
  }
}
const crossing=pricing.evaluateOffer(peregrine,{startAt:'2026-07-07T22:30:00Z',timeZone:'Europe/Paris',energyKwh:2,durationMinutes:60,chargingMinutes:60});
assert(crossing.complete);assert.equal(crossing.totalEur,0.96);
const peregrineStation=stations.find(s=>s.offers.some(o=>o.evseIds.includes('GB*CK0*E27099')));
const evaluation=sessionEngine.evaluateStation(peregrineStation,{startAt:'2026-07-07T22:30:00Z',timeZone:'Europe/Paris',energyKwh:2,durationMinutes:60,chargingMinutes:60},{targetCurrency:'GBP'});
assert(evaluation.best);assert(shell.renderPowerLines({station:peregrineStation,evaluation}).includes('horaires UTC'));
const timeline=sessionEngine.evaluateTimelineOffer(peregrine,{startAt:'2026-07-07T22:30:00Z',timeZone:'Europe/Paris',energyKwh:3,durationMinutes:60,chargingMinutes:60,chargeTimeline:[{offsetMinutes:0,durationMinutes:30,energyKwh:2},{offsetMinutes:30,durationMinutes:30,energyKwh:1}]});
assert(timeline.complete);assert.equal(timeline.totalEur,1.49004);assert.equal(timeline.timeZone,'UTC');
const lyndhurst=offers.find(o=>o.evseIds.includes('GB*CK0*E18250'));
assert(lyndhurst);assert.equal(pricing.evaluateOffer(lyndhurst,{startAt:'2026-10-07T12:00:00Z',energyKwh:1}).totalEur,0.54);
assert(!offers.some(o=>o.evseIds.includes('GB*CK0*E19825')));
const bad=structuredClone(source);bad.locations[0].evses[0].connectors[0].validatedV9Offer.metadata.connectorId='foreign';
assert.throws(()=>adapter.normalizePayload({sources:[bad]}),/pricing scope/);
console.log(JSON.stringify({stations:stations.length,offers:offers.length,profiles:profiles.size,utcBoundaries:'verified',cheapOption:'excluded',parkingFee:'excluded'}));
