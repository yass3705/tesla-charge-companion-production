import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),e=require('../runtime-owned/assets/v9/offer-engine.js');
const raw=[{id:'a',provider:'Source',kind:'direct',currency:'EUR',countries:['FR'],evseIds:['e1'],connectorIds:['c1'],pricing:{type:'kwh',pricePerKwh:.4}},{id:'b',provider:'Source',kind:'direct',currency:'EUR',countries:['FR'],evseIds:['e2'],connectorIds:['c2'],pricing:{type:'kwh',pricePerKwh:.4}},{id:'sub',provider:'Source',subscriptionId:'plan',countries:['FR'],currency:'EUR',pricing:{type:'kwh',pricePerKwh:.3}}];
const prepared=e.prepareOffers(raw,{countryCode:'FR'}),expected=e.dedupeOffers(raw,{countryCode:'FR'});
assert.deepEqual(prepared,expected);
for(const subscriptions of [[],['plan']])assert.deepEqual(e.eligibleOffers({countryCode:'FR',offers:prepared},subscriptions),e.eligibleOffers({countryCode:'FR',offers:expected},subscriptions));
assert.deepEqual(e.dedupeOffers(prepared,{countryCode:'DE'}),[]);
assert.throws(()=>{prepared[0].pricing.pricePerKwh=999;},TypeError);
raw[0].pricing.pricePerKwh=.5;
assert.equal(prepared.find(o=>o.id==='a').pricing.pricePerKwh,.4);
assert.equal(e.prepareOffers(raw,{countryCode:'FR'}).find(o=>o.id==='a').pricing.pricePerKwh,.5);
const duplicate=[...prepared,structuredClone(prepared[0])];assert.deepEqual(e.dedupeOffers(duplicate,{countryCode:'FR'}),e.dedupeOffers([...expected,structuredClone(expected[0])],{countryCode:'FR'}));
// Selecting a cloned winner must not lose the other exact offer's provenance
// metadata. The result must be independent of acquisition arrival order.
const shared={...raw[0],pricing:{type:'kwh',pricePerKwh:.4}};
const low={...shared,id:'low',sourceId:'archive',priority:1,metadata:{rawEvidence:'preserved-source',timeZone:'Europe/Paris',choice:'old'}};
const high={...shared,id:'high',sourceId:'renewed',priority:2,metadata:{validation:'technical',timeZone:'Europe/Paris',choice:'new'}};
const forward=e.prepareOffers([low,high],{countryCode:'FR'});
const reverse=e.prepareOffers([high,low],{countryCode:'FR'});
assert.deepEqual(forward,reverse);
assert.equal(forward[0].id,'high');
assert.equal(forward[0].metadata.rawEvidence,'preserved-source');
assert.equal(forward[0].metadata.validation,'technical');
assert.equal(forward[0].metadata.choice,'new');
assert.deepEqual(forward[0].pricing,{type:'kwh',pricePerKwh:.4});
assert.deepEqual(forward[0].evseIds,['e1']);
assert.deepEqual(forward[0].connectorIds,['c1']);
console.log('Immutable preparation preserves exact identities, subscriptions, countries and changes; no session-result caching PASS');
