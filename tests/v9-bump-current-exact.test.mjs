import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const runtime=process.argv[2]?resolve(process.argv[2],'runtime'):resolve(process.env.TCC_STABLE_ROOT||'/private/tmp/tcc-v9-stable-pin','v9-production-runtime');
const catalogue=JSON.parse(readFileSync(process.argv[2]?resolve(runtime,'data/v9/france-bump-offers.json'):
  resolve('data/overlays/france-bump-exact-current-2026-10-13.json'),'utf8'));
const adapter=require(resolve(runtime,'assets/v9/adapters/direct-offers.js'));
const data=require(resolve(runtime,'assets/v9/data-engine.js'));
const pricing=require(resolve(runtime,'assets/v9/pricing-engine.js'));
const rules=adapter.normalizePayload(catalogue).offerRules;
const ids=catalogue.directOffers.flatMap(offer=>offer.evseIds);
assert.equal(ids.length,1744);
assert.equal(new Set(ids).size,ids.length);
assert.equal(catalogue.unjoinedSourceRankableEvse.length,543);
assert.equal(catalogue.sourceEvidence.quarantinedSourceRankablePoints,8);
assert.ok(catalogue.directOffers.every(offer=>offer.verifiedScope==='exact_evse'));
assert.ok(catalogue.directOffers.every(offer=>offer.pricing.rules.every(rule=>!('kind' in rule))));

const exact='FRBMPEBMP0837';
const station={id:'FR:national:FRBMPS748000',countryCode:'FR',physicalOperator:{id:'bump',name:'Bump'},
  networkBrand:'Bump',evses:[{id:'cfg',pdcIds:[exact],connectors:[{id:'ac',kind:'AC',powerKw:22}]}]};
const matching=rules.filter(rule=>data.ruleMatchesStation(rule,station));
assert.equal(matching.length,1,'one direct offer must match the exact EVSE');
assert.equal(rules.filter(rule=>data.ruleMatchesStation(rule,{...station,evses:[{...station.evses[0],pdcIds:['UNRELATED']}]})).length,0);
const scenario={energyKwh:0,durationMinutes:60,chargingMinutes:50,postChargeMinutes:10,
  startAt:'2026-10-13T10:00:00+02:00',timeZone:'Europe/Paris'};
const quote=pricing.evaluateOffer(matching[0],scenario);
assert.equal(quote.complete,true);
assert.equal(quote.totalEur,1.055,'0.555 fixed + 50 charging minutes × 0.01; idle time is not charged');
assert.equal(quote.components.chargingTime,0.5);
assert.equal(quote.components.sessionFee,0.555);
console.log(JSON.stringify({ok:true,attachedEvses:ids.length,offerGroups:rules.length,unjoined:543,quote:quote.totalEur}));
