#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const adapter=require('../runtime-overrides/assets/v9/adapters/uk-open-feeds.js');
const [file,reportFile]=process.argv.slice(2);
assert.ok(file&&reportFile,'PCPR feed and its matching audit required');
const payload=JSON.parse(gunzipSync(fs.readFileSync(file)).toString('utf8'));
const report=JSON.parse(fs.readFileSync(reportFile,'utf8'));
assert.equal(payload.integrationStatus,'cpo_direct_exact_connector_vat_inclusive');
assert.equal(payload.collectedAt,report.sourceCollectedAt);
assert.equal(report.readyForTariffRanking,true);
assert.equal(payload.sources.length,1);
const source=payload.sources[0];
assert.equal(source.id,'eco-movement-pcpr-cpo-direct');
assert.equal(source.pricingScope,'cpo_direct_pcpr');
assert.equal(source.locations.length,report.stagedPublicLocations);
assert.equal(source.tariffs.length,report.GBPConvertedTariffs);
const tariffs=new Map(source.tariffs.map(x=>[x.id,x]));
assert.equal(tariffs.size,source.tariffs.length);
assert.ok(tariffs.size>0);
for(const tariff of tariffs.values()){
  assert.equal(tariff.currency,'GBP');
  assert.equal(tariff.tccPriceBasis,'GBP_including_public_UK_VAT');
  for(const el of tariff.elements||[])for(const pc of el.price_components||[]){
    assert.ok(Number.isFinite(pc.price)&&pc.price>=0);
    assert.ok(Number.isFinite(pc.sourcePriceExVat)&&pc.sourcePriceExVat>=0);
    assert.ok(Math.abs(pc.price-pc.sourcePriceExVat*(1+pc.tccVatRateAppliedPct/100))<0.000002);
  }
}
let connectors=0,priced=0,refs=0,unpriced=0;
const seen=new Set();
for(const loc of source.locations){
  assert.equal(loc.publish,true);
  assert.ok(['GBR','GB'].includes(loc.country));
  assert.equal(loc.operator?.name,'ChargePoint');
  for(const evse of loc.evses||[])for(const c of evse.connectors||[]){
    connectors++;
    const key=[loc.id,evse.evse_id,c.id].join('|');
    assert.ok(!seen.has(key),'duplicate connector '+key);seen.add(key);
    assert.ok(Array.isArray(c.tariff_ids));
    assert.ok(Array.isArray(c.sourceTariffIds));
    refs+=c.sourceTariffIds.length;
    assert.ok(c.tariff_ids.every(id=>c.sourceTariffIds.includes(id)&&tariffs.has(id)),'unresolved/foreign tariff ID');
    if(c.tariff_ids.length)priced++;else unpriced++;
  }
}
assert.equal(connectors,report.stagedConnectors);
assert.equal(priced,report.stagedRankableDirectOffers);
assert.equal(unpriced,report.stagedUnpricedConnectors);
assert.equal(refs,report.sourceTariffReferencesPreserved);
assert.ok(priced>0);
for(const loc of [source.locations[0],source.locations[Math.floor(source.locations.length/2)],source.locations.at(-1)]){
  const station=adapter.normalizePayload({sources:[{...source,locations:[loc]}]}, {sourceId:source.id})[0];
  assert.ok(station,'station must remain visible');
  assert.equal(station.physicalOperator.name,'ChargePoint');
  for(const e of loc.evses||[])for(const c of e.connectors||[]){
    const normalized=station.evses.find(x=>x.id===e.evse_id);
    const connector=normalized?.connectors.find(x=>x.id===c.id);
    assert.ok(connector,'exact connector missing');
    assert.equal((connector.offers||[]).length,c.tariff_ids.length,'wrong number of connector offers');
    for(const offer of connector.offers||[]){
      assert.equal(offer.kind,'direct');
      assert.equal(offer.currency,'GBP');
      assert.equal(offer.metadata.priceBasis,'GBP_including_public_UK_VAT');
      assert.deepEqual(offer.evseIds,[e.evse_id]);
      assert.deepEqual(offer.connectorIds,[c.id]);
      assert.ok(c.tariff_ids.includes(offer.metadata.tariffId));
      assert.equal(offer.pricing.type,'component_groups');
      assert.ok(offer.pricing.componentGroups.length>0);
    }
  }
}
console.log(JSON.stringify({ok:true,locations:source.locations.length,connectors,priced,unpriced,tariffs:tariffs.size,upstreamReferences:refs}));
