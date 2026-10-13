import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const adapter=require('../runtime-overrides/assets/v9/adapters/national-compact.js');
const shell=require('../v9-production-shell/bridge.js');

const stable=process.env.TCC_STABLE_ROOT||'/private/tmp/tcc-live-audit-stable';
const expectedLegacyGroups=Number(process.env.TCC_EXPECT_FR_IRVE_LEGACY_WATT_GROUPS||0);
const file=path.join(stable,'v9-production-runtime/data/v9/france-static/all.json.gz');
const rows=JSON.parse(zlib.gunzipSync(fs.readFileSync(file)));
let correctedGroups=0,uncertainDcGroups=0;const correctedStations=new Set(),uncertainDcStations=new Set();
for(const row of rows){
  for(const group of row[8]||[])if(group[2]==='DC'&&Number(group[3])>1000){uncertainDcGroups++;uncertainDcStations.add(row[0]);}
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
assert.equal(correctedGroups,expectedLegacyGroups,'pinned and current Stable have distinct, explicit IRVE power baselines');
assert.equal(correctedStations.size,expectedLegacyGroups?663:0);
assert.equal(uncertainDcGroups,expectedLegacyGroups?9:0);
assert.equal(uncertainDcStations.size,expectedLegacyGroups?6:0);
const safran=rows.find(row=>row[0]==='FRZWOEZW02962');
const normalized=adapter.normalizeRow(safran,{countryCode:'FR',sourceId:'france-national'});
assert.equal(normalized.evses[0].connectors[0].powerKw,expectedLegacyGroups?7.36:7);
assert.equal(normalized.evses[0].pdcIds[0],'FRZWOEZW029621');
assert.equal(adapter.francePowerKw('AC',7360),7.36,'legacy watt sample always converts exactly');
assert.equal(adapter.francePowerKw('DC',1200),1200,'uncertain DC anomalies require separate source proof');
assert.equal(adapter.francePowerKw('AC',22),22);
const station={id:'FR:national:UNCERTAIN',countryCode:'FR',physicalOperator:{id:'test',name:'Test'},evses:[{id:'BAD-DC',connectors:[{id:'DC-1',kind:'DC',powerKw:1200}]}]};
const direct={id:'direct-test',provider:'Test',kind:'direct',currency:'EUR',pricing:{type:'kwh',pricePerKwh:0.5}};
assert.equal(shell.unverifiedFranceDcPower(station,'DC',1200),true);
const [guarded]=shell.guardUnverifiedPowerOffers(station,'DC',1200,[direct]);
assert.equal(guarded.metadata.incompletePricingReason,'irve_dc_nominal_power_unverified');
assert.equal(direct.metadata,undefined,'source offer remains untouched');
assert.match(shell.renderPowerLines({station,powerLine:{kind:'DC',powerKw:1200,count:1},evaluation:{best:null}}),/Puissance à vérifier/);
assert.equal(shell.unverifiedFranceDcPower({...station,countryCode:'DE'},'DC',1200),false);
if(process.argv[2]){
  const engine=require(path.resolve(process.argv[2],'runtime/assets/v9/session-engine.js'));
  const quote=engine.evaluateStation({...station,offers:[guarded]},{energyKwh:30,durationMinutes:45,startAt:'2026-10-13T12:00:00+02:00',targetCurrency:'EUR'},
    {targetCurrency:'EUR',fxRates:{EUR:1}});
  assert.equal(quote.comparableOfferCount,0,'uncertain DC power must not enter ranking');
}
console.log(JSON.stringify({ok:true,correctedGroups,correctedStations:correctedStations.size,safranKw:normalized.evses[0].connectors[0].powerKw,uncertainDcGroups}));
