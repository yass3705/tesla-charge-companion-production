#!/usr/bin/env node
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const adapter=require('../runtime-overrides/assets/v9/adapters/uk-open-feeds.js');

const offer={id:'pcpr-exact',provider:'Ubitricity',kind:'direct',currency:'GBP',
  stationIds:['site-1'],evseIds:['GB*UBI*E1'],
  pricing:{type:'rules',timeZone:'Europe/London',rules:[{currency:'GBP',pricePerKwh:0.49}]},
  metadata:{connectorId:'1',scope:'cpo_direct_pcpr_verified',pricingSource:'PCPR OCPI first-match',
    paygVerification:false}};
const location={id:'site-1',party_id:'UBI',country_code:'GB',coordinates:{latitude:'51.5',longitude:'-0.1'},
  evses:[{evse_id:'GB*UBI*E1',connectors:[{id:'1',tariff_ids:[],validatedV9Offer:offer}]}]};
const source={id:'ubitricity-pcpr-payg',pricingScope:'cpo_direct_pcpr_verified',locations:[location],tariffs:[]};
const count=s=>adapter.normalizePayload({sources:[s]})[0].offers.length;
assert.equal(count(source),1,'PCPR first-match offer survives a diagnostic PAYG presentation difference');
assert.equal(count({...source,pricingScope:'other'}),0,'source scope must agree');
const wrong=structuredClone(source);
wrong.locations[0].evses[0].connectors[0].validatedV9Offer.metadata.connectorId='other';
assert.equal(count(wrong),0,'connector identity remains mandatory');
console.log('Ubitricity PCPR priority adapter: pass');
