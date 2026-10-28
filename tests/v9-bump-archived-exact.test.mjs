import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const adapter=require('../runtime-owned/assets/v9/adapters/canonical-v9.js');
const pricing=require('../runtime-overrides/assets/v9/pricing-engine.js');
const {createEngine}=require('../runtime-owned/assets/v9/data-engine.js');

const file=process.argv[2];
if(!file)throw new Error('pass the isolated, SHA-verified FR Bump national exact canonical file');
const data=JSON.parse(readFileSync(file,'utf8'));
assert.equal(data.source.id,'FR:bump_national_exact');
const fragments=adapter.toFragments(data);
const evaluated=fragments.flatMap(station=>station.offers);
const raw=fragments.flatMap(station=>station.unparsedOffers);
assert.equal(evaluated.length+raw.length,data.offers.length,'no archived offer disappears');
const example=fragments.find(station=>station.offers.length);
const physical={...example,offers:[],unparsedOffers:[],provenance:[{sourceId:'FR:irve_static'}]};
const merge=createEngine({registry:{sources:[
  {id:'FR:irve_static',countries:['FR'],priority:100,active:true},
  {id:'FR:bump_national_exact',countries:['FR'],priority:50,active:true}]},
  loaders:{'FR:irve_static':async()=>[physical],
    'FR:bump_national_exact':async()=>[example]}});
const merged=await merge.queryArea({countryCode:'FR'});
assert.equal(merged.stations.length,1,'exact national station remains a single card');
assert.deepEqual(merged.stations[0].offers.map(o=>o.id).sort(),
  example.offers.map(o=>o.id).sort(),'all exact Bump offers survive the merge');
const sources=new Map(data.offers.map(offer=>[offer.id,offer]));
for(const station of fragments){
  for(const offer of station.offers){
    const source=sources.get(offer.id),evse=station.evses.find(row=>row.id===source.scope.evseId);
    assert.ok(evse,'priced offer remains on its exact national EVSE');
    assert.equal(source.officialEvseId,evse.officialEvseId);
    assert.equal(offer.kind,'direct');
    assert.equal(offer.currency,'EUR');
    assert.deepEqual(offer.evseIds,[evse.id]);
    assert.deepEqual(offer.connectorIds,evse.connectors.map(row=>row.id).sort());
    assert.deepEqual(offer.pricing,source.rawOffer.compiledOffer.pricing,
      'the archived, previously compiled rule is reused exactly');
    const quote=pricing.evaluateOffer(offer,{startAt:'2026-10-13T10:00:00+02:00',
      energyKwh:10,durationMinutes:60,chargingMinutes:50,postChargeMinutes:10,
      timeZone:'Europe/Paris'});
    assert.equal(quote.complete,true,`documented Bump component unsupported: ${quote.reason||offer.id}`);
  }
}
const historical=evaluated.find(offer=>{
  const rule=offer.pricing.rules[0];
  return rule.sessionFeeEur===.555&&rule.chargingTimePerMinuteEur===.01;
});
assert.ok(historical,'archived Bump duration plus fixed fee oracle present');
const quote=pricing.evaluateOffer(historical,{startAt:'2026-10-13T10:00:00+02:00',
  energyKwh:0,durationMinutes:60,chargingMinutes:50,postChargeMinutes:10,
  timeZone:'Europe/Paris'});
assert.equal(quote.complete,true);
assert.equal(quote.totalEur,1.055,'historical 0.555 fixed plus 50 charging minutes');
const postOffer=evaluated.find(offer=>offer.pricing.postChargeFee?.eurPerMinute>0);
assert.ok(postOffer,'archived post-charge fee example present');
const post=postOffer.pricing.postChargeFee,postRule=postOffer.pricing.rules[0];
const postChargeMinutes=post.graceMinutes+20;
const postQuote=pricing.evaluateOffer(postOffer,{startAt:'2026-10-13T10:00:00+02:00',
  energyKwh:10,durationMinutes:50+postChargeMinutes,chargingMinutes:50,postChargeMinutes,
  timeZone:'Europe/Paris'});
const postExpected=Math.max(postOffer.pricing.minimumTotalEur||0,
  (postRule.pricePerKwh||0)*10+20*post.eurPerMinute);
assert.equal(postQuote.complete,true);
assert.equal(postQuote.totalEur,Math.round(postExpected*1e6)/1e6,
  'post-charge amount uses its own clock and archived rate');

const conditional=evaluated.find(offer=>offer.pricing.conditionalSessionFees?.some(fee=>
  fee.conditions.some(condition=>condition.kind==='energy_above_kwh')));
assert.ok(conditional,'archived conditional fee example present');
const conditionalQuote=pricing.evaluateOffer(conditional,{startAt:'2026-10-13T10:00:00+02:00',
  energyKwh:10,durationMinutes:60,chargingMinutes:50,postChargeMinutes:10,
  timeZone:'Europe/Paris'});
const conditionalRule=conditional.pricing.rules[0],extra=conditional.pricing.conditionalSessionFees
  .filter(fee=>fee.conditions.every(condition=>condition.kind==='energy_above_kwh'?10>condition.value:
    condition.kind==='session_duration_after_minutes'&&60>condition.value))
  .reduce((sum,fee)=>sum+fee.amountEur,0);
const conditionalExpected=Math.max(conditional.pricing.minimumTotalEur||0,
  (conditionalRule.pricePerKwh||0)*10+(conditionalRule.sessionFeeEur||0)+extra);
assert.equal(conditionalQuote.complete,true);
assert.equal(conditionalQuote.totalEur,Math.round(conditionalExpected*1e6)/1e6,
  'conditional archived fee is included only when all strict conditions pass');

const changed=structuredClone(data);
changed.offers[0].rawOffer.compiledOffer.pricing.rules[0].unknownNewFee=1;
const changedFragments=adapter.toFragments(changed);
assert.ok(changedFragments.some(station=>station.unparsedOffers.some(offer=>offer.id===changed.offers[0].id)),
  'an unproved component must remain raw');
console.log(JSON.stringify({stations:fragments.length,evaluated:evaluated.length,raw:raw.length,
  oracleTotal:quote.totalEur,postChargeTotal:postQuote.totalEur,
  conditionalTotal:conditionalQuote.totalEur}));
