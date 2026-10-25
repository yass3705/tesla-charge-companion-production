#!/usr/bin/env node
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const adapter=require('../runtime-overrides/assets/v9/adapters/uk-open-feeds.js');
const pricingEngine=require('../runtime-overrides/assets/v9/pricing-engine.js');

const offer={id:'pcpr-exact',provider:'Ubitricity',kind:'direct',currency:'GBP',
  stationIds:['site-1'],evseIds:['GB*UBI*E1'],
  pricing:{type:'rules',timeZone:'Europe/London',rules:[{scope:'allDay',currency:'GBP',pricePerKwh:0.49}],
    postChargeFee:{eurPerMinute:0.05,graceMinutes:60,
      exemptLocalWindows:[{start:'20:00',end:'08:00'}]}},
  metadata:{connectorId:'1',scope:'cpo_direct_pcpr_verified',pricingSource:'PCPR OCPI first-match',
    paygVerification:false,idleFeeSource:'https://ubitricity.com/en/driver/pricing/'}};
const location={id:'site-1',party_id:'UBI',country_code:'GB',coordinates:{latitude:'51.5',longitude:'-0.1'},
  evses:[{evse_id:'GB*UBI*E1',connectors:[{id:'1',tariff_ids:[],validatedV9Offer:offer}]}]};
const source={id:'ubitricity-pcpr-payg',pricingScope:'cpo_direct_pcpr_verified',locations:[location],tariffs:[]};
const count=s=>adapter.normalizePayload({sources:[s]})[0].offers.length;
assert.equal(count(source),1,'PCPR first-match offer survives a diagnostic PAYG presentation difference');
assert.equal(count({...source,pricingScope:'other'}),0,'source scope must agree');
const wrong=structuredClone(source);
wrong.locations[0].evses[0].connectors[0].validatedV9Offer.metadata.connectorId='other';
assert.equal(count(wrong),0,'connector identity remains mandatory');
const wrongFee=structuredClone(source);
wrongFee.locations[0].evses[0].connectors[0].validatedV9Offer.pricing.postChargeFee.exemptLocalWindows=[];
assert.equal(count(wrongFee),0,'night exemption is mandatory for verified idle offers');
const idle=(postChargeStartAt,postChargeMinutes)=>pricingEngine.evaluateOffer(offer,{
  startAt:postChargeStartAt,durationMinutes:0,energyKwh:0,postChargeStartAt,postChargeMinutes});
assert.equal(idle('2026-11-02T09:00:00Z',60).totalEur,0,'first hour after charge is free');
assert.equal(idle('2026-11-02T09:00:00Z',61).totalEur,0.05,'daytime minute after grace is charged');
assert.equal(idle('2026-11-02T18:30:00Z',120).totalEur,1.5,'only 19:30-20:00 is charged');
assert.equal(idle('2026-11-02T19:30:00Z',120).totalEur,0,'night remains free');
assert.equal(idle('2026-11-02T06:30:00Z',120).totalEur,1.5,'billing resumes at 08:00');
assert.equal(idle('2026-11-02T20:00:00Z',600).totalEur,0,'overnight parking stays free');
assert.equal(pricingEngine.evaluateOffer(offer,{startAt:'2026-11-02T08:00:00Z',
  durationMinutes:60,chargingMinutes:60,energyKwh:0,postChargeMinutes:61}).totalEur,0.05,
  'explicit charging duration derives the post-charge start without a guessed clock time');
const unknown=pricingEngine.evaluateOffer(offer,{startAt:'2026-11-02T09:00:00Z',
  durationMinutes:0,energyKwh:0,postChargeMinutes:61});
assert.equal(unknown.complete,false,'missing end-of-charge time cannot be ranked');
const noZone=structuredClone(offer);delete noZone.pricing.timeZone;
assert.equal(pricingEngine.evaluateOffer(noZone,{startAt:'2026-11-02T09:00:00Z',
  durationMinutes:0,energyKwh:0,postChargeStartAt:'2026-11-02T09:00:00Z',
  postChargeMinutes:61}).reason,'post_charge_exemption_requires_time_zone',
  'local exemption cannot use the host time zone');
console.log('Ubitricity PCPR priority adapter: pass');
