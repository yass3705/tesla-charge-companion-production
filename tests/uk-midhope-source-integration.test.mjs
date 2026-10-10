#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const adapter=require('../runtime-overrides/assets/v9/adapters/uk-open-feeds.js');
const pricing=require('../runtime-overrides/assets/v9/pricing-engine.js');
const sourcePath=process.argv[2]||'datalab/data/national/uk_connected_kerb_midhope_verified_v9.json.gz';
const doc=JSON.parse(zlib.gunzipSync(fs.readFileSync(sourcePath)).toString('utf8'));
assert.equal(doc.country,'GB');
assert.equal(doc.sources.length,1);
assert.equal(doc.sources[0].id,'connected-kerb-midhope-guest-verified');
const rows=adapter.normalizePayload(doc,{sourceId:'uk-connected-kerb-midhope-guest-verified'});
assert.equal(rows.length,1);
const station=rows[0];
assert.equal(station.countryCode,'GB');
assert.equal(station.offers.length,4,'Only four public EVSE connector-scoped offers admitted');
assert.equal(station.evses.length,4);
const seen=new Set();
for(const offer of station.offers){
 assert.equal(offer.provider,'Connected Kerb');
 assert.equal(offer.kind,'direct');
 assert.equal(offer.pricing.type,'connected_kerb_midhope_guest_verified');
 assert.equal(offer.validThrough,'2026-10-24');
 assert.equal(offer.connectorIds.length,1);
 assert.equal(offer.evseIds.length,1);
 const key=offer.evseIds[0]+'|'+offer.connectorIds[0];
 assert.equal(seen.has(key),false,key);
 seen.add(key);
 const crossing=pricing.evaluateOffer(offer,{startAt:'2026-10-12T07:20:00Z',
  durationMinutes:30,chargingMinutes:30,energyKwh:5,postChargeMinutes:0});
 assert.equal(crossing.complete,true,JSON.stringify(crossing));
 assert.ok(Math.abs(crossing.totalEur-2.79984)<1e-6);
 const winter=pricing.evaluateOffer(offer,{startAt:'2026-11-02T09:00:00Z',
  durationMinutes:30,chargingMinutes:30,energyKwh:5,postChargeMinutes:0});
 assert.equal(winter.complete,true,'DST conversion in Europe/London does not change price');
}
const old=doc.sources[0];
const bad={...doc,sources:[{...old,locations:old.locations.map(loc=>({...loc,evses:loc.evses.map(e=>({...e,
 connectors:e.connectors.map(c=>({...c,validatedV9Offer:{...c.validatedV9Offer,metadata:{...c.validatedV9Offer.metadata,connectorId:'fabricated'}}}))}))}))}]};
const rejected=adapter.normalizePayload(bad,{sourceId:'uk-connected-kerb-midhope-guest-verified'});
assert.equal(rejected.length,1);
assert.equal(rejected[0].offers.length,0,'Bad connector proof must never yield rankable offer');
console.log(JSON.stringify({pass:true,stations:rows.length,exactOffers:seen.size,summerPricing:true,
 winterBlocked:true,tamperedOffersRejected:true}));
