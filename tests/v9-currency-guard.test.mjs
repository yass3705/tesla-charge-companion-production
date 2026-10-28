import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const require=createRequire(import.meta.url);
const pricing=require('../runtime-overrides/assets/v9/pricing-engine.js');
const {evaluateOffer}=pricing;
const context={TCCV9OfferEngine:{eligibleOffers:station=>station.offers||[]},TCCV9PricingEngine:pricing};
runInNewContext(readFileSync(new URL('../runtime-overrides/assets/v9/session-engine.js',import.meta.url),'utf8'),context);
const {evaluateSessionStartLockedOffer,evaluateTimelineOffer}=context.TCCV9SessionEngine;

const session={energyKwh:20,durationMinutes:30,chargingMinutes:30,postChargeMinutes:0};
const base={id:'currency-fixture',pricing:{type:'rules',rules:[{
  scope:'allDay',start:'00:00',end:'24:00',pricePerKwh:0.35}]}};
assert.equal(evaluateOffer(base,session).reason,'currency_missing');
const swiss={...base,pricing:{...base.pricing,rules:[{...base.pricing.rules[0],currency:'CHF'}]}};
const quote=evaluateOffer(swiss,session);
assert.equal(quote.complete,true);
assert.equal(quote.currency,'CHF');
assert.equal(quote.totalEur,7);
assert.equal(evaluateOffer({...swiss,currency:'EUR'},session).reason,'currency_conflict_or_invalid');
assert.equal(evaluateOffer({...base,currency:'EUR'},session).currency,'EUR');
const locked={...base,pricing:{type:'rules',timeZone:'Europe/Zurich',
  priceSelectionBasis:'session_start_local_time',rules:[{...base.pricing.rules[0],currency:'CHF'}]}};
const timed={...session,startAt:'2026-10-28T12:00:00Z'};
assert.equal(evaluateSessionStartLockedOffer(locked,timed).currency,'CHF');
assert.equal(evaluateSessionStartLockedOffer({...locked,pricing:{...locked.pricing,
  rules:[base.pricing.rules[0]]}},timed).reason,'currency_missing');
assert.equal(evaluateTimelineOffer({...base,pricing:{...base.pricing,
  timeZone:'Europe/Zurich'}},timed).reason,'currency_missing');
console.log('V9 currency: missing or conflicting units fail closed; explicit CHF remains CHF');
