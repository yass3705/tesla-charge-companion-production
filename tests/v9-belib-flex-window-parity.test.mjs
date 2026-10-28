import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import path from 'node:path';
const require=createRequire(import.meta.url);
const site=process.argv[2];
const root=site?path.resolve(site,'runtime/assets/v9'):path.resolve('runtime-overrides/assets/v9');
const pricing=require(path.join(root,'pricing-engine.js'));
const context={TCCV9PricingEngine:pricing,TCCV9OfferEngine:require('../runtime-owned/assets/v9/offer-engine.js')};
runInNewContext(readFileSync(path.join(root,'session-engine.js'),'utf8'),context);
const sessionEngine=context.TCCV9SessionEngine;
const shell=require(site?path.resolve(site,'v9-production-shell/bridge.js'):'../v9-production-shell/bridge.js');

// Frozen Belib resident Flex profile from Stable's france-belib-offers.json.
const offer={id:'belib-resident-flex',currency:'EUR',metadata:{timeZone:'Europe/Paris'},pricing:{type:'rules',rules:[
  {scope:'timeWindow',start:'08:00',end:'20:00',currency:'EUR',pricePerKwh:.33,
    connectedTimeBlockMinutes:15,connectedTimeBlockEur:.37,connectedTimeBlockRounding:'started_block'},
  {scope:'timeWindow',start:'20:00',end:'23:00',currency:'EUR',pricePerKwh:.33,connectedTimeComponentEur:0},
  {scope:'timeWindow',start:'23:00',end:'08:00',currency:'EUR',pricePerKwh:.25,connectedTimeComponentEur:0}
]}};
const session={energyKwh:10,durationMinutes:30,chargingMinutes:20,postChargeMinutes:10};
const aligned=pricing.evaluateOffer(offer,{...session,startAt:'2026-10-28T18:45:00Z'});
assert.equal(aligned.complete,true,JSON.stringify(aligned));
assert.equal(aligned.totalEur,3.67,'19:45–20:15 local: energy plus one proved connected block');
assert.equal(aligned.components.segmentedPricing.segments[0].components.connectedTimeBlocks.costEur,.37);
assert.ok(!JSON.stringify(aligned.components).includes('parkingTime'),'connected time is not parking');
const cut=pricing.evaluateOffer(offer,{...session,startAt:'2026-10-28T18:50:00Z'});
assert.equal(cut.complete,false);
assert.equal(cut.reason,'connected_block_crosses_tariff_boundary_ambiguous');
const night=pricing.evaluateOffer(offer,{...session,startAt:'2026-10-28T21:45:00Z'});
assert.equal(night.complete,true,JSON.stringify(night));
assert.equal(night.totalEur,3.1,'22:45–23:15 local: energy allocated over 20 charging minutes, no connected surcharge');
const scoped={...offer,kind:'direct',provider:'Belib',subscriptionId:'belib-resident',evseIds:['FRV75E-FLEX'],connectorKinds:['AC']};
const station={id:'FRV75P-FLEX',countryCode:'FR',evses:[
  {id:'FRV75E-FLEX',connectors:[{id:'C-FLEX',kind:'AC',powerKw:7}]},
  {id:'FRV75E-OTHER',connectors:[{id:'C-OTHER',kind:'AC',powerKw:22}]}
],offers:[scoped]};
const evaluated=sessionEngine.evaluateStation(station,{...session,startAt:'2026-10-28T18:45:00Z'},
  {selectedSubscriptions:['belib-resident'],targetCurrency:'EUR'});
assert.equal(evaluated.best?.total,3.67,JSON.stringify(evaluated));
assert.equal(evaluated.best?.connectorId,'C-FLEX');
const markup=shell.renderTariffs(evaluated,station,{},['belib-resident']);
assert.match(markup,/Temps connecté par bloc : 0,37 €/);
assert.match(markup,/Énergie : 3,30 €/);
assert.doesNotMatch(markup,/Stationnement :/);
assert.equal(sessionEngine.evaluateStation({...station,evses:station.evses.slice(1)},
  {...session,startAt:'2026-10-28T18:45:00Z'},
  {selectedSubscriptions:['belib-resident'],targetCurrency:'EUR'}).eligibleOfferCount,0);
console.log('Belib Flex exact connected block at time-window boundary PASS');
