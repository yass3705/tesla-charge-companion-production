import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url);
const runtime=process.argv[2]?path.join(path.resolve(process.argv[2]),'runtime/assets/v9'):path.resolve('runtime-owned/assets/v9');
const offers=require(path.join(runtime,'offer-engine.js'));
const session=require(path.join(runtime,'session-engine.js'));
const shell=require('../v9-production-shell/bridge.js');
const freeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);for(const item of Object.values(value))freeze(item);}return value;};
const make=(id,evse,connector,currency='EUR')=>({id,provider:'Fixture',kind:'direct',currency,countries:['FR'],
 evseIds:[evse],connectorIds:[connector],pricing:{type:'rules',rules:[{scope:'allDay',pricePerKwh:.4}]}});
const inputs=freeze([make('a','evse-a','plug-a'),make('b','evse-b','plug-b')]);
const snapshot=JSON.stringify(inputs);
const result=offers.dedupeOffers(inputs,{countryCode:'FR'});
assert.equal(result.length,2,'equal prices must not collapse different EVSE/connector scopes');
assert.equal(JSON.stringify(inputs),snapshot,'normalization and key construction do not mutate input');
for(const suffix of [null,'subscription','equivalent']){
 const rows=inputs.map(o=>({...o,...(suffix==='subscription'?{subscriptionId:'plan'}:{}),...(suffix==='equivalent'?{equivalenceKey:'declared-equivalence'}:{})}));
 assert.equal(offers.dedupeOffers(rows,{countryCode:'FR'}).length,2,'subscription/equivalence labels cannot override exact scope');
}
assert.equal(offers.dedupeOffers([inputs[0],{...inputs[0],id:'same-scope-copy',priority:2}],{countryCode:'FR'}).length,1,'same-scope duplicate still deduplicates');
assert.equal(offers.dedupeOffers([inputs[0],{...inputs[0],id:'GBP',currency:'GBP'}],{countryCode:'FR'}).length,2,'currencies must remain distinct');
for(const field of ['stationIds','networkIds','networkAliases','plugNames'])
 assert.equal(offers.dedupeOffers([inputs[0],{...inputs[0],id:field,[field]:['different']}],{countryCode:'FR'}).length,2,field);
for(const field of ['minPowerKw','maxPowerKw'])
 assert.equal(offers.dedupeOffers([inputs[0],{...inputs[0],id:field,[field]:50}],{countryCode:'FR'}).length,2,field);
const station={id:'fixture',countryCode:'FR',physicalOperator:{name:'Fixture'},offers:inputs,evses:[
 {id:'evse-a',connectors:[{id:'plug-a',kind:'AC',powerKw:7}]},
 {id:'evse-b',connectors:[{id:'plug-b',kind:'AC',powerKw:22}]}]};
const merged=offers.mergeStationOffers(station,[],{countryCode:'FR'});
for(const evse of station.evses){
 const quote=session.evaluateStation({...merged,evses:[evse]}, {energyKwh:10,durationMinutes:60,chargingMinutes:60,consumptionKwhPer100Km:20});
 assert.equal(quote.comparableOfferCount,1,'only the exact EVSE offer is eligible');
 assert.equal(quote.best.total,4,'source price is unchanged on each EVSE');
 assert.equal(quote.best.offerId,evse.id==='evse-a'?'a':'b');
}
const countryRate=freeze({...inputs[0],ratesByCountry:{FR:{rules:[{scope:'allDay',pricePerKwh:.5}]}}});
assert.equal(offers.semanticKey(countryRate,'FR'),offers.semanticKey({...countryRate,pricing:{...countryRate.pricing,...countryRate.ratesByCountry.FR},ratesByCountry:undefined},'FR'));
console.log('Exact offer scopes, currencies, subscriptions and unchanged per-EVSE prices PASS');

const raw={id:'raw',channel:'Direct',scope:{evseId:'evse-a',connectorId:'plug-a'},calculationStatus:'not_evaluated',rawOffer:{unvalidatedRate:999}};
const local={...merged,evses:[station.evses[0]],unparsedOffers:[raw]};
const quote=session.evaluateStation(local,{energyKwh:10,durationMinutes:60,chargingMinutes:60,consumptionKwhPer100Km:20});
const html=shell.renderTariffs(quote,local);
assert.match(html,/Prix calculé/);
assert.match(html,/Tarif incalculable/,'a calculated direct rate must not hide an additional raw direct offer');
assert.doesNotMatch(html,/999/,'raw amounts must remain uncalculated');
console.log('Calculated and raw offers remain distinct on the same EVSE/channel PASS');
