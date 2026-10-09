#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const adapter=require('../runtime-overrides/assets/v9/adapters/uk-open-feeds.js');
const file=process.argv[2];
const reportFile=process.argv[3];
assert.ok(file&&reportFile,'Expected audited Data Lab PCPR source and staging report');
const payload=JSON.parse(gunzipSync(fs.readFileSync(file)).toString('utf8'));
const report=JSON.parse(fs.readFileSync(reportFile,'utf8'));
assert.equal(payload.integrationStatus,'inventory_stage_unverified_cpo_direct_tariffs');
assert.equal(payload.collectedAt,report.sourceCollectedAt);
assert.equal(report.readyForTariffRanking,false);
assert.equal(report.stagedRankableDirectOffers,0);
assert.equal(payload.sources.length,1);
const source=payload.sources[0];
assert.equal(source.id,'eco-movement-pcpr-cms-unverified');
assert.deepEqual(source.tariffs,[]);
assert.ok(source.locations.length>0);
assert.equal(source.locations.length,report.stagedPublicLocations);
let count=0, refs=0;
const IDs=new Set(), connectorIds=new Set();
for(const loc of source.locations){
  assert.equal(loc.publish,true);
  assert.ok(['GBR','GB'].includes(loc.country));
  assert.equal(loc.operator?.name,'CPO non identifié (ChargePoint CMS)');
  assert.ok(!IDs.has(loc.id),'duplicate location');
  IDs.add(loc.id);
  for(const evse of loc.evses||[]){
    for(const c of evse.connectors||[]){
      count++;
      assert.ok(Array.isArray(c.sourceTariffIdsUnverified));
      assert.ok(!('tariff_ids' in c),'unverified upstream tariff must not become a direct offer');
      assert.ok(!c.validatedV9Offer);
      refs+=c.sourceTariffIdsUnverified.length;
      const k=loc.id+'|'+evse.evse_id+'|'+c.id;
      assert.ok(!connectorIds.has(k),'duplicate connector');
      connectorIds.add(k);
    }
  }
}
assert.equal(count,report.stagedConnectors);
assert.equal(refs,report.sourceTariffReferencesPreserved);
for(const loc of [source.locations[0],source.locations[Math.floor(source.locations.length/2)],source.locations.at(-1)]){
  const normal=adapter.normalizePayload({sources:[{...source,locations:[loc]}]}, {sourceId:'uk-eco-movement-pcpr-cms-unverified'});
  assert.equal(normal.length,1,'staged location must be visible');
  assert.equal(normal[0].countryCode,'GB');
  assert.equal(normal[0].physicalOperator.name,'CPO non identifié (ChargePoint CMS)');
  assert.deepEqual(normal[0].offers,[],'no consumer PAYG tariffs until independently verified');
}
console.log(JSON.stringify({ok:true,locations:source.locations.length,connectors:count,upstreamTariffReferencesRetained:refs,activeTariffOffers:0}));
