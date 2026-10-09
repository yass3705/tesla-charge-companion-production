#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const adapter=require('../runtime-overrides/assets/v9/adapters/uk-open-feeds.js');
const mapEngine=require('../runtime-overrides/assets/v9/map-price-engine.js');
const [input, built] = process.argv.slice(2);
assert.ok(input,'Provide Data Lab Gridserve validated dataset');
function load(path){return JSON.parse(gunzipSync(readFileSync(path)));}
const payload=load(input);
assert.equal(payload.country,'GB');
assert.equal(payload.sources.length,1);
const source=payload.sources[0];
assert.equal(source.id,'gridserve-pcpr-direct');
assert.equal(source.pricingScope,'cpo_direct_exact_connector');
assert.ok(source.locations.length>=100);
const map=new Map(source.tariffs.map(t=>[String(t.id),t]));
assert.ok(map.size>=3);
let expected=0;
const locKeys=new Set();
for(const loc of source.locations){
  assert.equal(loc.publish,true);
  assert.equal(loc.country_code,'GB');
  assert.ok(!/^(EF\s*-\s*DEPOT|Network Rail\s*-|_Retired|_Live Testing)/i.test(loc.name),'private, testing or retired location');
  assert.ok(!locKeys.has(loc.id),'duplicate location');
  locKeys.add(loc.id);
  for(const evse of loc.evses||[]){
    assert.notEqual(evse.status,'REMOVED');
    for(const conn of evse.connectors||[]){
      const ids=conn.tariff_ids||[];
      assert.ok(ids.length,'no priced connector in verified sample');
      for(const id of ids){
        assert.ok(map.has(String(id)), 'unresolved direct price');
        assert.equal(map.get(String(id)).party_id,loc.party_id);
        expected++;
      }
    }
  }
}
const result=adapter.normalizePayload(payload,{sourceId:'uk-gridserve-pcpr-direct'});
assert.equal(result.length,source.locations.length);
let actual=0;
for(const loc of result){
  const offers=loc.offers||[];
  for(const offer of offers){
    assert.equal(offer.kind,'direct');
    assert.equal(offer.currency,'GBP');
    assert.equal(offer.connectorIds.length,1);
    assert.equal(offer.evseIds.length,1);
    assert.equal(offer.metadata.connectorId,offer.connectorIds[0]);
    assert.equal(offer.stationIds.length,1);
    assert.equal(offer.stationIds[0],loc.canonicalId.split(':').slice(-1)[0]);
    actual++;
  }
  const attached=loc.evses.flatMap(e=>e.connectors).flatMap(c=>c.offers||[]);
  assert.equal(attached.length,offers.length,'every station offer must also be bound to its connector');
}
assert.equal(actual,expected,'exact Gridserve connector offer count');
if(built){
  const deployed=load(built);
  assert.deepEqual(deployed,payload,'deployed Gridserve data must match audited source');
}
const synthetic={id:'test',name:'Test',latitude:51.5,longitude:-0.1,
  evses:[{id:'E1',connectors:[{id:'1',powerKw:50},{id:'2',powerKw:150}]}],
  offers:[{id:'only-first',kind:'direct',evseIds:['E1'],connectorIds:['1'],pricePerKm:0.14}]};
const mapped=mapEngine.normalizeEvseRows([synthetic]);
assert.equal(mapped.length,2);
assert.equal(mapped[0].offers.length,1,'matched connector has its price');
assert.equal(mapped[1].offers.length,0,'other connector must stay unpriced');
console.log(JSON.stringify({locations:source.locations.length,verifiedConnectorOffers:actual,adapter:'pass',perConnectorIsolation:'pass'}));
