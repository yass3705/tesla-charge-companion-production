import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url);
const shell=require('../v9-production-shell/bridge.js');

const base={id:'electra-direct-exact:FRELCP12954376:tariff',provider:'Electra',kind:'direct',currency:'EUR',
  metadata:{verified:true,source:'Electra exact France snapshot'},
  pricing:{type:'component_groups',componentGroups:[{kind:'ocpi-element:0',rules:[{scope:'allDay',pricePerKwh:0.49,connectionFee:1,idlePerMinute:0.05}]},{kind:'ocpi-element:1',rules:[{scope:'allDay',pricePerKwh:null,congestionTimePerMinute:0.4}]}]}};
const station={countryCode:'FR',physicalOperator:{id:'electra',name:'Electra'},offers:[base]};
const essential=shell.electraPlusOffers(station,['electra-plus-essential']);
assert.equal(essential.length,1);
assert.equal(essential[0].subscriptionId,'electra-plus-essential');
assert.equal(essential[0].pricing.componentGroups[0].rules[0].pricePerKwh,0.39);
assert.equal(essential[0].pricing.componentGroups[0].rules[0].connectionFee,1);
assert.equal(essential[0].pricing.componentGroups[0].rules[0].idlePerMinute,0.05);
assert.equal(essential[0].pricing.componentGroups[1].rules[0].congestionTimePerMinute,0.4);
assert.equal(base.pricing.componentGroups[0].rules[0].pricePerKwh,0.49,'base direct price must remain intact');
assert.equal(shell.electraPlusOffers(station,['electra-plus-smart'])[0].pricing.componentGroups[0].rules[0].pricePerKwh,0.29);
assert.deepEqual(shell.electraPlusOffers(station,[]),[]);
assert.deepEqual(shell.electraPlusOffers({...station,offers:[base,{...base,id:base.id+':second'}]},['electra-plus-essential']),[],'unattributed competing station tariffs must not be discounted');
assert.deepEqual(shell.electraPlusOffers({...station,physicalOperator:{id:'lidl',name:'Lidl'}},['electra-plus-essential']),[],'Electra eMSP at another CPO does not confer Electra+');
assert.deepEqual(shell.electraPlusOffers({...station,offers:[{...base,metadata:{verified:false}}]},['electra-plus-essential']),[]);
assert.deepEqual(shell.electraPlusOffers({...station,offers:[{...base,pricing:{type:'component_groups',componentGroups:[{rules:[{connectionFee:1}]}]}}]},['electra-plus-essential']),[],'no discount without a verified energy base');
const evaluation={best:{offerId:essential[0].id,provider:'Electra',kind:'subscription',subscriptionId:'electra-plus-essential',total:11.7,comparable:true,result:{complete:true,totalEur:11.7}},alternatives:[],incomplete:[]};
const html=shell.renderTariffs(evaluation,{...station,offers:[...station.offers,...essential]},{},['electra-plus-essential']);
assert.match(html,/Electra\+ Essentiel|electra-plus-essential/);
assert.match(html,/11,70/);
assert.match(html,/data-v9-lane-label="Direct"/);
assert.match(html,/data-v9-lane-label="Electra"/);
if(process.argv[2]){
  const sessionEngine=require(path.resolve(process.argv[2],'runtime/assets/v9/session-engine.js'));
  const pricedBase={...base,pricing:{...base.pricing,componentGroups:[base.pricing.componentGroups[0]]}};
  const pricingStation={...station,offers:[pricedBase,...shell.electraPlusOffers({...station,offers:[pricedBase]},['electra-plus-essential'])],evses:[{id:'FRELCE1',connectors:[{id:'CCS-1',kind:'DC',powerKw:150}]}]};
  const quote=sessionEngine.evaluateStation(pricingStation,{energyKwh:30,durationMinutes:45,chargingMinutes:45,postChargeMinutes:0,startAt:'2026-10-13T12:00:00+02:00',targetCurrency:'EUR'},
    {selectedSubscriptions:['electra-plus-essential'],targetCurrency:'EUR',fxRates:{EUR:1}});
  const prices=[quote.best,...quote.alternatives].filter(Boolean);
  assert.equal(prices.find(item=>item.subscriptionId==='electra-plus-essential')?.total,12.7,'30 kWh at 0.39 €/kWh plus the unchanged 1 € fee');
  assert.equal(prices.find(item=>!item.subscriptionId)?.total,15.7,'30 kWh at 0.49 €/kWh plus the unchanged 1 € fee');
}
console.log(JSON.stringify({ok:true,base:0.49,essential:0.39,smart:0.29,ambiguousSkipped:true,foreignOperatorSkipped:true}));
