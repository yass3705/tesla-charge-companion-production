#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const adapter=require('../runtime-overrides/assets/v9/adapters/uk-open-feeds.js');
const input=process.argv[2];
assert.ok(input,'Connected Kerb audited V9 input required');
const payload=JSON.parse(zlib.gunzipSync(fs.readFileSync(input)).toString('utf8'));
assert.deepEqual(payload.sources.map(x=>x.id),['connected-kerb-guest']);
const rows=adapter.normalizePayload(payload,{sourceId:'uk-connected-kerb-guest-direct'});
const offers=rows.flatMap(s=>s.offers);
assert.equal(rows.length,2102);
assert.equal(offers.length,8100);
for(const row of rows){
  assert.equal(row.physicalOperator.name,'Connected Kerb');
  for(const offer of row.offers){
    assert.equal(offer.kind,'direct');
    assert.equal(offer.currency,'GBP');
    assert.equal(offer.pricing.timeZone,'UTC');
    assert.equal(offer.connectorIds.length,1);
    assert.equal(offer.evseIds.length,1);
    assert.equal(offer.stationIds.length,1);
    assert.equal(offer.stationIds[0],row.aliases.find(a=>a===offer.stationIds[0]));
    const evse=row.evses.find(e=>e.id===offer.evseIds[0]);
    assert.ok(evse?.connectors.some(c=>c.id===offer.connectorIds[0]));
  }
}
const first=payload.sources[0].locations[0];
const bad=structuredClone(payload.sources[0].locations[0]);
bad.evses[0].connectors[0].validatedV9Offer.metadata.connectorId='wrong';
const normalized=adapter.normalizeLocation(bad,payload.sources[0],new Map(),{sourceId:'uk-connected-kerb-guest-direct'});
assert.equal(normalized.offers.length,first.evses.flatMap(e=>e.connectors).length-1);
assert.ok(adapter.powerKw({power_type:'AC_3_PHASE',max_voltage:230,max_amperage:32})>22);
console.log(JSON.stringify({pass:true,stations:rows.length,exactOffers:offers.length,utc:true,tamperRejected:true}));
