import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),root=path.resolve(process.argv[2]);
const pricing=require(path.join(root,'runtime/assets/v9/pricing-engine.js'));
const engine=require(path.join(root,'runtime/assets/v9/session-engine.js'));
const adapter=require(path.join(root,'runtime/assets/v9/adapters/uk-open-feeds.js'));
const payload=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,'snapshot-inputs/UK/all.json.gz'))));
const source=payload.sources.find(s=>s.id==='ubitricity-pcpr-payg');assert(source);
const stations=adapter.normalizePayload({sources:[source]}),offers=stations.flatMap(s=>s.offers);
assert.equal(stations.length,12424);assert(offers.length>13000);
const ids=new Set(offers.map(o=>o.id));assert.equal(ids.size,offers.length);
const profiles=new Map();
for(const o of offers){assert.equal(o.currency,'GBP');assert.equal(o.pricing.timeZone,'Europe/London');assert.equal(o.metadata.vatIncluded,true);profiles.set(JSON.stringify(o.pricing),o);}
for(const o of profiles.values()){
 for(let day=0;day<7;day++)for(let m=0;m<1440;m++){
  const weekday=['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'][day];
  const matches=o.pricing.rules.filter(r=>(!r.days||r.days.includes(weekday))&&pricing.ruleContains(r,m));
  assert.equal(matches.length,1,`${o.id} day ${day} minute ${m}`);
 }
}
const main=offers.find(o=>o.evseIds.includes('GB*UBI*E10000144'));assert(main);
for(const [date,offset] of [['2026-07-07',1],['2026-12-07',0]]){
 for(const [hour,minute,cost] of [[6,59,.45],[7,0,.56],[15,59,.56],[16,0,.67],[19,59,.67],[20,0,.56],[23,59,.56]]){
  const at=`${date}T${String(hour-offset).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00Z`;
  for(const timeZone of ['UTC','Europe/Paris']){const r=pricing.evaluateOffer(main,{startAt:at,timeZone,energyKwh:1,durationMinutes:0});assert(r.complete);assert.equal(r.totalEur,cost);}
 }
}
const cross=engine.evaluateTimelineOffer(main,{startAt:'2026-12-07T15:30:00Z',timeZone:'Europe/Paris',energyKwh:2,durationMinutes:60,chargingMinutes:60,chargeTimeline:[{offsetMinutes:0,durationMinutes:30,energyKwh:1.5},{offsetMinutes:30,durationMinutes:30,energyKwh:.5}]});
assert(cross.complete);assert.equal(cross.totalEur,1.175);
const idle=offers.find(o=>o.pricing.rules.some(r=>r.postChargeRate===.05));assert(idle);
const base=engine.evaluateCompactMinuteOffer(idle,{startAt:'2026-12-07T10:00:00Z',energyKwh:1,durationMinutes:121,chargingMinutes:1});
assert(base.complete);assert.equal(base.totalEur,Number((idle.pricing.rules.find(r=>pricing.ruleContains(r,600)).pricePerKwh+3).toFixed(6)));
for(const t of ['2ad31c3bf8759020e02523db8d8c7d9e','6fc1ae3a29994220791ee2b4fb1b4604','be724f0ff4cf7e86b56e45fe1b9b9762'])assert(!offers.some(o=>o.metadata.tariffId===t));
const bad=structuredClone(source);const c=bad.locations.flatMap(l=>l.evses.flatMap(e=>e.connectors)).find(c=>c.validatedV9Offer);c.validatedV9Offer.metadata.connectorId='foreign';assert.throws(()=>adapter.normalizePayload({sources:[bad]}),/pricing scope/);
assert(!payload.sources.filter(s=>s.id!=='ubitricity-pcpr-payg').some(s=>s.locations?.some(l=>l.party_id==='UBI')));
console.log(JSON.stringify({stations:stations.length,offers:offers.length,profiles:profiles.size,vat:'verified',boundaries:'summer/winter',idleGrace:'60 minutes',conflictingTariffs:'excluded'}));
