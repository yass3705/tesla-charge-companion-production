#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const adapter=require('../runtime-overrides/assets/v9/adapters/uk-open-feeds.js');
const path=process.argv[2];
assert.ok(path,'Data Lab Ubitricity V9 path is required');
const payload=JSON.parse(gunzipSync(readFileSync(path)));
assert.equal(payload.sources.length,1);
const source=payload.sources[0];
assert.equal(source.id,'ubitricity-pcpr-payg');
assert.equal(source.tariffs.length,0);
assert.ok(source.locations.length>=12000);
let connectors=0,priced=0,unpriced=0,pricedLocation=null,unpricedLocation=null;
const locIds=new Set(),connectorIds=new Set();
for(const loc of source.locations){
  assert.equal(loc.country_code,'GB');
  assert.equal(loc.party_id,'UBI');
  assert.equal(loc.operator?.name,'Ubitricity');
  assert.ok(!locIds.has(loc.id),'duplicate location');
  locIds.add(loc.id);
  for(const evse of loc.evses||[]){
    for(const connector of evse.connectors||[]){
      connectors++;
      const key=evse.evse_id+':'+connector.id;
      assert.ok(!connectorIds.has(key),'duplicate connector');
      connectorIds.add(key);
      assert.deepEqual(connector.tariff_ids,[]);
      const offer=connector.validatedV9Offer;
      if(offer){
        priced++;pricedLocation ||= loc;
        assert.equal(offer.kind,'direct');
        assert.equal(offer.currency,'GBP');
        assert.equal(offer.metadata?.paygVerification,true);
        assert.deepEqual(offer.stationIds,[String(loc.id)]);
        assert.deepEqual(offer.evseIds,[evse.evse_id]);
        assert.equal(String(offer.metadata.connectorId),String(connector.id));
        assert.ok(offer.pricing?.rules?.length>0);
      }else{unpriced++;unpricedLocation ||= loc;}
    }
  }
}
assert.equal(connectors,priced+unpriced);
assert.ok(priced>13000);
assert.ok(unpriced>0);
for(const loc of [pricedLocation,unpricedLocation]){
  const rows=adapter.normalizePayload({sources:[{...source,locations:[loc]}]},{sourceId:'uk-ubitricity-pcpr-payg'});
  assert.equal(rows.length,1,'location must remain visible');
  const expected=(loc.evses||[]).flatMap(e=>e.connectors||[]).filter(c=>c.validatedV9Offer).length;
  assert.equal(rows[0].offers.length,expected,'only verified connector offers become rankable');
}
const corrupted=structuredClone(pricedLocation);
for(const evse of corrupted.evses||[])for(const connector of evse.connectors||[]){
  if(connector.validatedV9Offer)connector.validatedV9Offer.metadata.connectorId='wrong';
}
assert.equal(adapter.normalizePayload({sources:[{...source,locations:[corrupted]}]})[0].offers.length,0);
const occupied=structuredClone(pricedLocation);
for(const evse of occupied.evses||[])evse.status='CHARGING';
assert.equal(adapter.normalizePayload({sources:[{...source,locations:[occupied]}]})[0].status.state,'unknown','charging EVSEs are not available');
console.log(JSON.stringify({locations:source.locations.length,connectors,priced,unpriced,runtimeAdapter:'pass'}));
