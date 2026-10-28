import assert from 'node:assert/strict';
import pricing from '../runtime-overrides/assets/v9/pricing-engine.js';

const session={energyKwh:10,durationMinutes:30,chargingMinutes:30,startAt:'2026-10-28T12:00:00Z'};
const offer=rule=>({id:'simple-fixture',currency:'EUR',pricing:rule});
for(const type of ['kwh','simple']){
  const result=pricing.evaluateOffer(offer({type,pricePerKwh:0.4}),session);
  assert.equal(result.complete,true);
  assert.equal(result.totalEur,4);
}
for(const rule of [
  {type:'tiered',pricePerKwh:0.4,tiers:[{upToKwh:5,pricePerKwh:0.2}]},
  {type:'kwh',pricePerKwh:0.4,pricePerMinute:0.1},
  {type:'simple',pricePerKwh:0.4,connectionFee:1},
  {type:'kwh',pricePerKwh:0.4,energyStepWh:1000},
  {type:'kwh',pricePerKwh:0.4,tiers:[{upToKwh:5,pricePerKwh:0.2}]},
]){
  const result=pricing.evaluateOffer(offer(rule),session);
  assert.equal(result.complete,false,'unknown or extra billed component must stay out of ranking');
  assert.equal(result.reason,'unsupported_pricing_component');
}
for(const extra of [{parkingSurchargeEur:2},{taxRatePct:20},{tierFeeEur:1}]){
  const result=pricing.evaluateOffer(offer({type:'rules',rules:[{
    scope:'allDay',pricePerKwh:0.4,...extra}]}),session);
  assert.equal(result.complete,false,'unknown rule component must prevent a partial quote');
  assert.equal(result.reason,'unsupported_pricing_component');
}
const topLevel=pricing.evaluateOffer(offer({type:'rules',rules:[{
  scope:'allDay',pricePerKwh:0.4}],parkingFeeEur:2}),session);
assert.equal(topLevel.reason,'unsupported_pricing_component');
const groupLevel=pricing.evaluateOffer(offer({type:'component_groups',componentGroups:[{
  kind:'ENERGY',rules:[{scope:'allDay',pricePerKwh:0.4}],extraFeeEur:2}]}),session);
assert.equal(groupLevel.reason,'unsupported_pricing_component');
console.log('V9 simple and compound pricing reject unhandled billed dimensions PASS');
