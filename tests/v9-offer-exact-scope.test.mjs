import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const require=createRequire(import.meta.url);
const runtime=process.argv[2]?path.join(path.resolve(process.argv[2]),'runtime/assets/v9'):path.resolve('runtime-owned/assets/v9');
const offers=require(path.join(runtime,'offer-engine.js'));
const context={TCCV9OfferEngine:offers};
if(!process.argv[2]){
 for(const name of ['pricing-engine','session-engine'])runInNewContext(readFileSync(path.resolve('runtime-overrides/assets/v9/'+name+'.js'),'utf8'),context);
}
const session=process.argv[2]?require(path.join(runtime,'session-engine.js')):context.TCCV9SessionEngine;
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

// Session evaluation must also enforce an EVSE-only scope, without a connector filter.
const evseOnly=inputs.map(({connectorIds,...offer})=>offer);
for(const evse of station.evses){
 const quote=session.evaluateStation({...station,evses:[evse],offers:evseOnly}, {energyKwh:10,durationMinutes:60});
 assert.equal(quote.comparableOfferCount,1);
 assert.equal(quote.best.offerId,evse.id==='evse-a'?'a':'b');
}
const dated=[{...inputs[0],id:'past',validThrough:'2025-12-31'}, {...inputs[0],id:'current',validFrom:'2026-01-01'}];
const preserved=offers.dedupeOffers(dated,{countryCode:'FR'});
assert.equal(preserved.length,2,'same-price validity windows are not interchangeable');
const datedQuote=session.evaluateStation({...station,evses:[station.evses[0]],offers:preserved}, {startAt:'2026-10-26T12:00:00Z',energyKwh:10,durationMinutes:60});
assert.equal(datedQuote.best.offerId,'current');
for(const marker of [{subscriptionId:'plan'}, {equivalenceKey:'same'}])
 for(const scope of [{operatorIds:['different']},{connectorKinds:['DC']},{validityBasis:'whole_session_local_date'},{metadata:{timeZone:'Europe/London'}}])
  assert.equal(offers.dedupeOffers([{...inputs[0],...marker},{...inputs[0],...marker,...scope}],{countryCode:'FR'}).length,2);
console.log('EVSE-only eligibility and distinct validity windows PASS');

const equalPowerStation={...station,evses:station.evses.map(e=>({...e,connectors:e.connectors.map(c=>({...c,powerKw:22}))})),offers:inputs};
const grouped=shell.variantsByPower({TCCV9SessionEngine:session,
 TCCV9SessionPlannerEngine:{planStation:(_st,s)=>({effectiveSession:s})},
 TCCV9StationScoreEngine:{scoreStation:()=>({})}},[{station:equalPowerStation}],{energyKwh:10,durationMinutes:60});
assert.equal(grouped.length,2,'equal-power EVSEs with distinct exact offers stay separate during evaluation');
assert.deepEqual(grouped.map(v=>v.evaluation.best.offerId).sort(),['a','b']);
assert.ok(grouped.every(v=>v.station.evses.length===1&&v.powerLine.count===1));
console.log('Shell grouping respects exact EVSE offer identity PASS');
