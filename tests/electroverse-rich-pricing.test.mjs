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
const electric55Offers=new Map();
for(const tile of manifest.tiles||[]){
  const payload=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(evRoot,tile.file))).toString('utf8'));
  assert.equal(payload.country,'FR');
  assert.equal(payload.emspOffers.length,tile.count);
  for(const offer of payload.emspOffers){
    seen++;
    for(const evseId of ['FR55CEFR78210P21PL1','FR55CEFR78390CHEVREU1LS0'])
      if(offer.evseIds?.includes(evseId))electric55Offers.set(evseId,offer);
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
const adapter=require(path.join(root,'runtime/assets/v9/adapters/france-emsp-compact.js'));
const bridge=require(path.join(root,'v9-production-shell/bridge.js'));
for(const [evseId,dayRate,nightRate] of [
  ['FR55CEFR78210P21PL1',0.04,0.03],
  ['FR55CEFR78390CHEVREU1LS0',0.08,0.06]
]){
  const exact=electric55Offers.get(evseId);
  assert.ok(exact,`pinned Electric 55 EVSE tariff ${evseId} must exist`);
  const rule=(start)=>exact.pricing.rules.find(row=>row.start===start);
  assert.equal(rule('07:00')?.chargePerMinute,dayRate);
  assert.equal(rule('23:00')?.idlePerMinute,nightRate);
  const session={timeZone:'Europe/Paris',energyKwh:10,durationMinutes:55,
    chargingMinutes:45,postChargeMinutes:10,powerKw:7.4};
  const quote=startAt=>pricing.evaluateOffer(exact,{...session,startAt});
  const near=(actual,want)=>assert.ok(Math.abs(actual-want)<1e-6,
    `${evseId}: expected ${want}, received ${actual}`);
  const day=quote('2026-10-13T12:00:00+02:00');
  assert.equal(day.complete,true);near(day.totalEur,55*dayRate);
  const night=quote('2026-10-13T23:30:00+02:00');
  assert.equal(night.complete,true);near(night.totalEur,55*nightRate);
  const crossing=quote('2026-10-13T22:45:00+02:00');
  assert.equal(crossing.complete,true);near(crossing.totalEur,15*dayRate+40*nightRate);
  assert.equal(crossing.components.segmentedPricing.segments[1].components.parkingTime,10*nightRate);
  const visible=bridge.appliedTariffRateLabels({currency:'EUR',result:crossing},exact);
  assert.ok(visible.some(label=>label.includes(`${nightRate.toFixed(2).replace('.',',')} EUR/min après charge`)));
  assert.ok(!visible.some(label=>label.includes(`${dayRate.toFixed(2).replace('.',',')} EUR/min après charge`)),
    'the compact summary must not claim daytime parking when only the night segment charged it');
  const parkingCross=pricing.evaluateOffer(exact,{...session,startAt:'2026-10-13T22:55:00+02:00',
    durationMinutes:13,chargingMinutes:3,postChargeMinutes:10});
  assert.equal(parkingCross.complete,true);
  near(parkingCross.totalEur,5*dayRate+8*nightRate);
  const withConnectionFee={...exact,pricing:{...exact.pricing,rules:exact.pricing.rules.map(row=>({...row,connectionFee:1}))}};
  const once=pricing.evaluateOffer(withConnectionFee,{...session,startAt:'2026-10-13T22:45:00+02:00'});
  assert.equal(once.complete,true);
  near(once.totalEur,15*dayRate+40*nightRate+1);
  const roundedParking={...exact,pricing:{...exact.pricing,rules:exact.pricing.rules.map(row=>({...row,parkingTimeStepSeconds:300}))}};
  const guarded=pricing.evaluateOffer(roundedParking,{...session,startAt:'2026-10-13T22:45:00+02:00'});
  assert.equal(guarded.complete,false,'rounded parking cannot be segmented without a proven whole-session rule');
}
const exactPlatformOffers=adapter.offerRulesFromPlatformOffers([
  {id:'evr-choisey-200',provider:'Electroverse',evseIds:['FRPD1EASCCHOBBC200011'],verifiedScope:'exact_evse_group',pricing:{type:'rules',rules:[{scope:'allDay',pricePerKwh:0.56}]},metadata:{verified:true,identityMode:'strict_generic_single_operator_homogeneous_exact_set'}},
  {id:'evr-choisey-240',provider:'Electroverse',evseIds:['FRPD1EASCCHOBBC300011'],verifiedScope:'exact_evse_group',pricing:{type:'rules',rules:[{scope:'allDay',pricePerKwh:0.56}]},metadata:{verified:true,identityMode:'strict_pd1_official_technical_homogeneous_group'}},
  {id:'unverified',provider:'Electroverse',evseIds:['FRPD1EASCCHOBBC200011'],verifiedScope:'exact_evse',pricing:{type:'rules',rules:[{scope:'allDay',pricePerKwh:0.44}]},metadata:{verified:false,identityMode:'exact_evse'}},
  {id:'no-identity-evidence',provider:'Electroverse',evseIds:['FRPD1EASCCHOBBC240011'],pricing:{type:'rules',rules:[{scope:'allDay',pricePerKwh:0.44}]},metadata:{verified:true}}
]);
assert.equal(exactPlatformOffers.length,2,'verified EVSE exact and homogeneous group identities are both retained');
assert.deepEqual(exactPlatformOffers.map(rule=>rule.evseIds[0]),['FRPD1EASCCHOBBC200011','FRPD1EASCCHOBBC300011']);
assert.ok(exactPlatformOffers.every(rule=>rule.pricing.rules[0].pricePerKwh===0.56));

const evrAcOffer={evseIds:['FRPD1EASCCHOALF22011']};
assert.equal(bridge.offerAppliesToEvseGroup(evrAcOffer,new Set(['FRPD1EASCCHOBBC200011']),new Set()),false);
assert.equal(bridge.offerAppliesToEvseGroup(evrAcOffer,new Set(['FRPD1EASCCHOBBC300011']),new Set()),false);
assert.equal(bridge.offerAppliesToEvseGroup(exactPlatformOffers[0],new Set(['FRPD1EASCCHOBBC200011']),new Set()),true);
assert.equal(bridge.offerAppliesToEvseGroup(exactPlatformOffers[1],new Set(['FRPD1EASCCHOBBC200011']),new Set()),false);

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
