import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url);
const pricing=require('../runtime-overrides/assets/v9/pricing-engine.js');
const uk=require('../runtime-overrides/assets/v9/adapters/uk-open-feeds.js');
const atlante=require('../runtime-overrides/assets/v9/adapters/atlante-italy-exact.js');
const snapshotRoot=path.resolve(process.argv[2]||'dist/v9-global-preview');
const session=require(path.join(snapshotRoot,'runtime/assets/v9/session-engine.js'));


const components=[
 {type:'ENERGY',price:0.4,step_size:250},
 {type:'TIME',price:3.6,step_size:60},
 {type:'FLAT',price:1.2},
 {type:'PARKING_TIME',price:1.2,step_size:300}
];
const ukPricing=uk.tariffPricing({currency:'GBP',elements:[{price_components:components.slice(0,3)},{price_components:[components[3]]}]});
assert.equal(ukPricing.type,'component_groups');
assert.equal(ukPricing.incompletePricingReason,undefined);
const sample={id:'sample',currency:'GBP',pricing:ukPricing};
const quote=pricing.evaluateOffer(sample,{energyKwh:10.1,durationMinutes:55,chargingMinutes:43,postChargeMinutes:12,startAt:'2026-10-08T12:00:00Z'});
assert.equal(quote.complete,true);
assert.ok(Math.abs(quote.totalEur-8.18)<1e-6,'ENERGY rounded 10.25kWh, TIME 43m, FLAT, PARKING_TIME 15m');
const window=uk.tariffPricing({currency:'GBP',elements:[
  {price_components:[{type:'ENERGY',price:0.2}],restrictions:{day_of_week:['MONDAY'],start_time:'08:00',end_time:'11:00',min_power:20}},
  {price_components:[{type:'FLAT',price:.5}]}
]});
assert.deepEqual(window.componentGroups[0].rules[0].days,[1]);
const monday=pricing.evaluateOffer({currency:'GBP',pricing:window},{energyKwh:10,durationMinutes:30,powerKw:22,startAt:'2026-10-05T09:00:00Z'});
assert.equal(monday.totalEur,2.5);
const sunday=pricing.evaluateOffer({currency:'GBP',pricing:window},{energyKwh:10,durationMinutes:30,powerKw:22,startAt:'2026-10-04T09:00:00Z'});
assert.equal(sunday.totalEur,.5);
assert.equal(pricing.evaluateOffer({currency:'EUR',pricing:{type:'component_groups',componentGroups:[{rules:[{scope:'timeWindow',start:'09:00',end:'10:00',pricePerKwh:.5}]}]}},{energyKwh:5,startAt:'2026-10-08T11:00:00Z'}).complete,false,'no applicable components cannot become a free price');
const unsupported=uk.tariffPricing({currency:'GBP',elements:[{price_components:[{type:'CUSTOM',price:1}]}]});
assert.match(unsupported.incompletePricingReason,/unsupported_component:CUSTOM/);
const connector={evseId:'IT*ATE*E100',connectorId:'C1',connectorType:'CCS',powerKw:150,tariffs:[{priceComponents:components.map(c=>({priceDimension:c.type,price:{incl_vat:c.price}}))}]};
const it=atlante.connectorRule(connector,{countryCode:'IT',partyId:'ATE',operatorName:'Atlante'});
assert.ok(it,'compound Atlante connector retained');
assert.equal(it.pricing.type,'component_groups');
assert.equal(pricing.evaluateOffer({currency:'EUR',pricing:it.pricing},{energyKwh:10,durationMinutes:50,chargingMinutes:40,postChargeMinutes:10,startAt:'2026-10-08T12:00:00Z'}).complete,true);
const withCondition=structuredClone(connector);
withCondition.tariffs[0].priceComponents[0].conditions=[{type:'unknown',value:100}];
const conditioned=atlante.connectorRule(withCondition,{countryCode:'IT',partyId:'ATE',operatorName:'Atlante'});
assert.ok(conditioned&&conditioned.metadata.incompletePricingReason,'unknown conditional tariff retained as unrankable');
const station={id:'FR-test',countryCode:'FR',evses:[{id:'E1',connectors:[{id:'C1',kind:'DC',powerKw:150}]}],offers:[{id:'power',provider:'test',kind:'direct',currency:'EUR',pricing:{type:'rules',rules:[{scope:'allDay',pricePerKwh:.41,minPowerKw:100}]}}]};
const evaluated=session.evaluateStation(station,{energyKwh:10,durationMinutes:30,startAt:'2026-10-08T09:00:00Z'});
assert.equal(evaluated.best.total,4.1,'power restrictions use actual charger power');
console.log('V9 OCPI pricing components and restrictions: pass');
