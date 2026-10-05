import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';

const root=path.resolve(process.argv[2]||'dist/v9-explicit-candidate');
const evRoot=path.join(root,'snapshot-inputs/FR/platforms/electroverse');
const manifest=JSON.parse(fs.readFileSync(path.join(evRoot,'manifest.json'),'utf8'));
const expected=Number(manifest.stats?.publishedOffers||0);
assert.ok(expected>=5000,'full Electroverse EVSE overlay must be present');
assert.equal(manifest.policy?.evseLevelPricing,true);
assert.equal(manifest.policy?.stationLevelFlattening,false);
let seen=0,bandOffers=0,weekdayOffers=0,feeOffers=0;
for(const tile of manifest.tiles||[]){
  const payload=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(evRoot,tile.file))).toString('utf8'));
  assert.equal(payload.country,'FR');
  assert.equal(payload.emspOffers.length,tile.count);
  for(const offer of payload.emspOffers){
    seen++;
    assert.ok(offer.evseIds?.length,'every published tariff must retain EVSE identity');
    assert.equal(offer.pricing?.type,'rules','rich rule tariff must remain intact');
    const rules=offer.pricing.rules||[];
    if(rules.some(r=>(r.ocpiDurationBands||[]).length))bandOffers++;
    if(rules.some(r=>(r.days||r.daysOfWeek||[]).length))weekdayOffers++;
    if(rules.some(r=>Number(r.connectionFee||0)>0||Number(r.idlePerMinute||0)>0))feeOffers++;
  }
}
assert.equal(seen,expected,'all compiled EVSE tariffs must be present in production overlay');

const require=createRequire(import.meta.url);
const pricing=require(path.join(root,'runtime/assets/v9/pricing-engine.js'));
const offer={
  id:'evr-complex-components',provider:'Electroverse',currency:'EUR',
  pricing:{type:'rules',rules:[{
    scope:'allDay',start:'00:00',end:'24:00',pricePerKwh:0.33,chargePerMinute:0.04,
    connectionFee:1,idlePerMinute:0.01,ocpiDurationBands:[
      ['ENERGY',3600,7200,0.4],['TIME',3600,7200,0.1],
      ['PARKING_TIME',3600,7200,0.02],['FLAT',3600,7200,2]
    ]
  }]}
};
const quote=pricing.evaluateOffer(offer,{
  startAt:'2026-10-05T10:00:00.000Z',timeZone:'UTC',energyKwh:10,
  durationMinutes:90,chargingMinutes:60,postChargeMinutes:30
});
assert.equal(quote.complete,true);
assert.equal(quote.totalEur,12.6);
assert.equal(quote.components.energy,4);
assert.equal(quote.components.chargingTime,6);
assert.equal(quote.components.connectionFee,2);
assert.equal(quote.components.parkingTime,0.6);

const weekdayOffer={pricing:{type:'rules',rules:[
  {scope:'allDay',start:'00:00',end:'24:00',pricePerKwh:0.2},
  {scope:'timeWindow',start:'00:00',end:'24:00',days:[1],pricePerKwh:0.5}
]}};
const monday=pricing.matchingRule(weekdayOffer.pricing,'2026-10-05T10:00:00.000Z','UTC',{});
const sunday=pricing.matchingRule(weekdayOffer.pricing,'2026-10-04T10:00:00.000Z','UTC',{});
assert.equal(monday.pricePerKwh,0.5);
assert.equal(sunday.pricePerKwh,0.2);

console.log(JSON.stringify({publishedOffers:seen,bandOffers,weekdayOffers,feeOffers,complexComponentQuote:quote.totalEur,weekdayRules:'passed'}));
