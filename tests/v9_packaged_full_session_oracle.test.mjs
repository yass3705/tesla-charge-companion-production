import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';

const require=createRequire(import.meta.url);
const site=path.resolve(process.argv[2]||'');
if(!site||!path.isAbsolute(site))throw new Error('Isolated package path required');
const runtime=path.join(site,'runtime/assets/v9');
const pricing=require(path.join(runtime,'pricing-engine.js'));
const sessionEngine=require(path.join(runtime,'session-engine.js'));
const uk=require(path.join(runtime,'adapters/uk-open-feeds.js'));

// These are synthetic sessions from already tested OCPI component shapes,
// never supplier prices or candidate offers.
const ukPricing=uk.tariffPricing({currency:'GBP',elements:[{price_components:[
  {type:'ENERGY',price:.4,step_size:250},
  {type:'TIME',price:3.6,step_size:60},
  {type:'FLAT',price:1.2,step_size:1},
  {type:'PARKING_TIME',price:1.2,step_size:300}
]}]});
assert.equal(ukPricing?.type,'rules');
const station={id:'fixture-station',countryCode:'GB',physicalOperator:{id:'fixture',name:'Fixture'},
  evses:[{id:'fixture-evse',connectors:[{id:'fixture-plug',kind:'DC',powerKw:150}]}],
  offers:[
    {id:'fixture-uk',provider:'UK direct fixture',kind:'direct',currency:'GBP',
      evseIds:['fixture-evse'],connectorIds:['fixture-plug'],pricing:ukPricing,
      metadata:{identityMode:'exact_canonical_connector_pcpr',timeZone:'Europe/London'}},
    {id:'fixture-electroverse',provider:'Electroverse',kind:'roaming',currency:'EUR',
      evseIds:['fixture-evse'],connectorIds:['fixture-plug'],
      pricing:{type:'rules',rules:[{scope:'allDay',start:'00:00',end:'24:00',
        pricePerKwh:.52,chargePerMinute:.04,idlePerMinute:.01,connectionFee:0}]},
      metadata:{identityMode:'exact_canonical_emsp_evse',timeZone:'Europe/London'}},
    {id:'fixture-electra-plan',provider:'Electra',kind:'roaming',currency:'EUR',
      subscriptionId:'fixture-plan',evseIds:['fixture-evse'],connectorIds:['fixture-plug'],
      pricing:{type:'rules',rules:[{scope:'allDay',start:'00:00',end:'24:00',pricePerKwh:.5}]}}
  ],unparsedOffers:[{id:'fixture-raw',channel:'Direct',scope:{evseId:'fixture-evse',connectorId:'fixture-plug'},
    rawOffer:{unknownFee:99},calculationStatus:'not_evaluated'}]};
const session={startAt:'2026-10-23T12:00:00Z',energyKwh:10,durationMinutes:55,
  chargingMinutes:45,postChargeMinutes:10,consumptionKwhPer100Km:20};
const ukQuote=pricing.evaluateOffer(station.offers[0],session);
assert.equal(ukQuote.complete,true);
assert.equal(ukQuote.totalEur,8.1,'energy 4 + charge time 2.7 + fixed 1.2 + parking .2');
assert.equal(ukQuote.components.energy,4);
assert.equal(ukQuote.components.chargingTime,2.7);
assert.equal(ukQuote.components.connectionFee,1.2);
assert.equal(ukQuote.components.parkingTime,.2);
const base=sessionEngine.evaluateStation(station,session,{targetCurrency:'EUR',fxRates:{GBP_EUR:1.2}});
assert.equal(base.best?.offerId,'fixture-electroverse');
assert.equal(base.best?.total,7.1);
assert.equal(base.best?.costPerRecoveredKm,.142);
assert.equal(base.alternatives[0]?.offerId,'fixture-uk');
assert.equal(base.alternatives[0]?.total,9.72);
assert.equal(base.eligibleOfferCount,2,'unselected plan and unparsed tariff stay outside comparison');
const subscribed=sessionEngine.evaluateStation(station,session,{targetCurrency:'EUR',
  fxRates:{GBP_EUR:1.2},selectedSubscriptions:['fixture-plan']});
assert.equal(subscribed.best?.offerId,'fixture-electra-plan');
assert.equal(subscribed.best?.total,5);
assert.equal(subscribed.comparableOfferCount,3);
const noFx=sessionEngine.evaluateStation(station,session,{targetCurrency:'EUR'});
assert.equal(noFx.best?.offerId,'fixture-electroverse');
assert.equal(noFx.comparableOfferCount,1,'missing exchange rate cannot be invented');
const noParking=sessionEngine.evaluateStation(station,{...session,postChargeMinutes:undefined},
  {targetCurrency:'EUR',fxRates:{GBP_EUR:1.2}});
assert.equal(noParking.comparableOfferCount,0,'two paid parking rules require an explicit duration');
assert.ok(noParking.incomplete.every(row=>row.result?.reason==='post_charge_duration_required'));
console.log('Packaged V9 full-session component, channel, subscription and FX oracle: pass');
