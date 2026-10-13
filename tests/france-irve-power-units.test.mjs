import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const adapter=require('../runtime-overrides/assets/v9/adapters/national-compact.js');

const stable=process.env.TCC_STABLE_ROOT||'/private/tmp/tcc-live-audit-stable';
const file=path.join(stable,'v9-production-runtime/data/v9/france-static/all.json.gz');
const rows=JSON.parse(zlib.gunzipSync(fs.readFileSync(file)));
let correctedGroups=0;const correctedStations=new Set();
for(const row of rows){
  const expected=(row[8]||[]).filter(group=>group[2]==='AC'&&Number(group[3])>1000&&Number(group[3])/1000<=43);
  if(!expected.length)continue;
  const station=adapter.normalizeRow(row,{countryCode:'FR',sourceId:'france-national',schemaVersion:1,queryDate:'2026-10-13'});
  correctedStations.add(row[0]);
  for(const group of expected){
    const evse=station.evses.find(item=>item.id===group[0]);
    assert.ok(evse,`${row[0]}: exact EVSE group disappeared`);
    assert.equal(evse.connectors[0].powerKw,Math.round(Number(group[3])/10)/100);
    assert.deepEqual(evse.pdcIds,group[6],`${row[0]}: official connector IDs changed`);
    assert.doesNotMatch(evse.label,/\b(?:7360|3680|22000) kW\b/);
    correctedGroups++;
  }
}
assert.equal(correctedGroups,675);
assert.equal(correctedStations.size,663);
const safran=rows.find(row=>row[0]==='FRZWOEZW02962');
const normalized=adapter.normalizeRow(safran,{countryCode:'FR',sourceId:'france-national'});
assert.equal(normalized.evses[0].connectors[0].powerKw,7.36);
assert.equal(normalized.evses[0].pdcIds[0],'FRZWOEZW029621');
assert.equal(adapter.francePowerKw('DC',1200),1200,'uncertain DC anomalies require separate source proof');
assert.equal(adapter.francePowerKw('AC',22),22);
console.log(JSON.stringify({ok:true,correctedGroups,correctedStations:correctedStations.size,safranKw:7.36}));
