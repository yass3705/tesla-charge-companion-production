import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const shell=require('../v9-production-shell/bridge.js');

const day={scope:'timeWindow',start:'07:00',end:'23:00',billing:'minute',currency:'EUR',chargePerMinute:0.04,idlePerMinute:0.04,congestionTimePerMinute:0};
const night={scope:'timeWindow',start:'23:00',end:'07:00',billing:'minute',currency:'EUR',chargePerMinute:0.03,idlePerMinute:0.03,congestionTimePerMinute:0};
const offer={id:'electroverse-place-lully-evse-2',provider:'Electroverse',kind:'emsp',currency:'EUR',pricing:{type:'rules',rules:[day,night]},metadata:{source:'Electroverse tariff cache',fetchedAt:'2026-10-04'}};
const neuillyRule={scope:'allDay',pricePerKwh:0.53,currency:'EUR'};
const neuilly={id:'metropolis-neuilly',provider:'Métropolis Recharge',kind:'direct',currency:'EUR',pricing:{type:'rules',rules:[neuillyRule]}};
const neuillyApplied={offerId:neuilly.id,currency:'EUR',result:{matchedRule:neuillyRule,components:{energy:5.83,
  postCharge:{costEur:1.5,appliedRateWindows:[
    {start:'08:00',end:'20:00',eurPerMinute:0.2,billedMinutes:5,costEur:1},
    {start:'20:00',end:'08:00',eurPerMinute:0.1,billedMinutes:5,costEur:0.5}]}}}};
assert.deepEqual(shell.appliedTariffRateLabels(neuillyApplied,neuilly),[
  '0,53 EUR/kWh','0,20 EUR/min après charge (08:00–20:00)',
  '0,10 EUR/min après charge (20:00–08:00)']);
const item={offerId:offer.id,provider:'Electroverse',kind:'emsp',currency:'EUR',targetCurrency:'EUR',total:13.22,comparable:true,result:{complete:true,totalEur:13.22,matchedRule:day,components:{chargingTime:13.22}}};
assert.deepEqual(shell.appliedTariffRateLabels(item,offer),['0,04 EUR/min charge (07:00–23:00)']);
assert.deepEqual(shell.appliedTariffRateLabels({...item,result:{...item.result,components:{chargingTime:12,parkingTime:1.22}}},offer),['0,04 EUR/min charge (07:00–23:00)','0,04 EUR/min après charge (07:00–23:00)']);
const split={...item,result:{...item.result,components:{segmentedPricing:{segments:[{rule:day,components:{chargingTime:1}},{rule:night,components:{chargingTime:1}}]}}}};
assert.deepEqual(shell.appliedTariffRateLabels(split,offer),['0,04 EUR/min charge (07:00–23:00)','0,03 EUR/min charge (23:00–07:00)'],'only traversed windows appear');
assert.equal(shell.tariffRateLabels(offer).some(label=>label.includes('congestion')),false,'zero congestion is not a payable condition');
const html=shell.renderTariffs({best:item,alternatives:[],incomplete:[]},{id:'FR:national:FR55CP78210SA1P21PL',countryCode:'FR',evses:[],offers:[offer]});
const main=html.split('<details class="v9-tariff-detail"')[0];
assert.match(main,/0,04 EUR\/min charge/);
assert.doesNotMatch(main,/0,03 EUR\/min charge/,'unused night window must stay out of the compact row');
assert.match(html,/Détail du tarif/);
assert.match(html,/0,03 EUR\/min charge/,'full tariff remains available in the expanded detail');
assert.match(html,/Electroverse tariff cache/);
console.log(JSON.stringify({ok:true,appliedWindow:'07:00–23:00',hiddenUnusedWindow:'23:00–07:00'}));
