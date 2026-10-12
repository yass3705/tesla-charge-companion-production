#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
assert.ok(process.argv[2],'Built snapshot path required');
const root=path.resolve(process.argv[2]);
const adapter=require(`${root}/runtime/assets/v9/adapters/uk-open-feeds.js`);
const payload=JSON.parse(zlib.gunzipSync(fs.readFileSync(`${root}/snapshot-inputs/UK/all.json.gz`)));
const rows=adapter.normalizePayload(payload,{sourceId:'uk-production-open-feeds'});
const offers=rows.flatMap(s=>s.offers);
assert.ok(rows.length>11000);
assert.ok(offers.length>20000);
assert.ok(offers.every(o=>o.stationIds?.length===1&&o.evseIds?.length===1&&o.connectorIds?.length===1));
assert.ok(rows.some(s=>s.evses.some(e=>e.connectors.some(c=>c.kind==='AC'&&c.powerKw>=22))));
assert.ok(rows.some(s=>s.evses.some(e=>e.connectors.some(c=>c.kind==='DC'&&c.powerKw>0))));
const direct={};
for(const [id,file] of [['uk-gridserve-pcpr-direct','uk_gridserve_v9.json.gz'],['uk-blink-pcpr-direct','uk_blink_pcpr_v9.json.gz']]){
  const doc=JSON.parse(zlib.gunzipSync(fs.readFileSync(`${root}/snapshot-inputs/UK/sources/${file}`)));
  const directRows=adapter.normalizePayload(doc,{sourceId:id});
  const directOffers=directRows.flatMap(s=>s.offers);
  assert.ok(directOffers.length>0,id);
  assert.ok(directOffers.every(o=>o.connectorIds?.length===1&&o.evseIds?.length===1&&o.stationIds?.length===1),id);
  direct[id]={stations:directRows.length,exactOffers:directOffers.length};
}
console.log(JSON.stringify({pass:true,stations:rows.length,exactConnectorOffers:offers.length,direct}));
