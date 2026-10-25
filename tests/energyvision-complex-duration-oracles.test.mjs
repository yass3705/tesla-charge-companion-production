import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const adapter=require('../runtime-overrides/assets/v9/adapters/energyvision-belgium.js');
const engine=require('../runtime-overrides/assets/v9/pricing-engine.js');
const basePaths=['energyPrice/priceGroupIndex','energyPrice/priceType','energyPrice/value','energyPrice/taxIncluded','energyPrice/taxRate'];
function part(type,amount,threshold=null){
 const leaves=basePaths.map(path=>({path,value:path==='energyPrice/priceGroupIndex'?'1':
   path==='energyPrice/priceType'?type:path==='energyPrice/value'?String(amount):
   path==='energyPrice/taxIncluded'?'true':'21'}));
 if(threshold!==null)leaves.push({path:'energyPrice/timeBasedApplicability/fromMinute',value:String(threshold)});
 return {priceType:type,amountSource:String(amount),groupIndex:'1',taxIncluded:'true',taxRateSource:'21',rawApplicabilityLeaves:leaves};
}
function offer(parts){
 const site={sourceSiteId:'s',sourceSiteType:'openSpace',sourceSiteEnergyRateCount:0,
   name:'Test',latitude:50.9,longitude:4.3,stations:[{
     sourceStationId:'station',sourceStationEnergyRateCount:1,pdc:[{
       externalEvseId:'BE*NRG*TEST*1',connectorType:'TYPE2',powerW:22000,status:'available',sourcePointEnergyRateCount:0
     }],sourceStationRatesUnassignedToPdc:[{sourceRateId:'rate',ratePolicy:'adHoc',currency:'EUR',
       sourceLastUpdated:'2026-10-13',priceComponents:parts}]
   }]};
 const st=adapter.normalizeSite(site);return st?.offers[0]||null;
}
const idle=offer([part('pricePerKWh',0.61),part('pricePerMinute',0.33,45)]);
assert.ok(idle);assert.deepEqual(idle.pricing.postChargeFee,{graceMinutes:45,eurPerMinute:0.33});
const opts={startAt:'2026-10-13T12:00:00+02:00',energyKwh:20,durationMinutes:180,chargingMinutes:120};
assert.equal(engine.evaluateOffer(idle,{...opts,postChargeMinutes:0}).totalEur,12.2);
assert.equal(engine.evaluateOffer(idle,{...opts,postChargeMinutes:45}).totalEur,12.2);
assert.equal(engine.evaluateOffer(idle,{...opts,postChargeMinutes:60}).totalEur,17.15);
assert.equal(engine.evaluateOffer(idle,opts).reason,'post_charge_duration_required',
  'missing post-charge span cannot silently skip a documented fee');
const connected=offer([part('pricePerKWh',0.37),part('basePrice',2.04),part('pricePerMinute',0.02,1080)]);
assert.ok(connected);assert.equal(connected.pricing.rules[0].connectedTimeFreeMinutes,1080);
assert.equal(engine.evaluateOffer(connected,{...opts,durationMinutes:1080,postChargeMinutes:0}).totalEur,9.44);
assert.equal(engine.evaluateOffer(connected,{...opts,durationMinutes:1200,postChargeMinutes:0}).totalEur,11.84);
assert.equal(offer([part('pricePerKWh',0.61),part('pricePerMinute',0.33,46)]),null);
assert.equal(offer([part('pricePerKWh',0.61),part('pricePerMinute',0.32,45)]),null);
const fake=part('pricePerMinute',0.33,45);fake.rawApplicabilityLeaves.push({path:'energyPrice/unknown',value:'x'});
assert.equal(offer([part('pricePerKWh',0.61),fake]),null);

const timePaths=[
 'energyPrice/overallPeriod/overallStartTime',
 'energyPrice/overallPeriod/validPeriod/recurringTimePeriodOfDay/startTimeOfPeriod',
 'energyPrice/overallPeriod/validPeriod/recurringTimePeriodOfDay/endTimeOfPeriod'
];
function timedPart(type,amount,start,end){
 const p=part(type,amount,360);
 p.rawApplicabilityLeaves.push(
 {path:timePaths[0],value:'2026-03-09T08:18:55.000000Z'},
 {path:timePaths[1],value:start},{path:timePaths[2],value:end});
 return p;
}
const early=part('pricePerKWh',0.28);
early.rawApplicabilityLeaves.push({path:'energyPrice/timeBasedApplicability/toMinute',value:'360'});
const daytime=offer([early,timedPart('pricePerKWh',0.28,'09:00:00','21:59:00'),
 timedPart('pricePerKWh',0.28,'22:00:00','23:59:00'),
 timedPart('pricePerKWh',0.28,'00:00:00','08:59:00'),
 timedPart('pricePerMinute',0.06,'09:00:00','21:59:00')]);
assert.ok(daytime);
assert.equal(daytime.pricing.postChargeFee.graceMinutes,360);
const daySession={energyKwh:20,durationMinutes:480,chargingMinutes:60,postChargeMinutes:420};
assert.equal(engine.evaluateOffer(daytime,{...daySession,startAt:'2026-10-13T09:00:00+02:00'}).totalEur,9.2);
assert.equal(engine.evaluateOffer(daytime,{...daySession,startAt:'2026-10-13T15:00:00+02:00'}).totalEur,5.6);
assert.equal(engine.evaluateOffer(daytime,{...daySession,startAt:'2026-10-13T14:30:00+02:00'}).totalEur,7.4);
const conflictPart=timedPart('pricePerMinute',0.06,'09:00:00','21:58:00');
assert.equal(offer([early,timedPart('pricePerKWh',0.28,'09:00:00','21:59:00'),
 timedPart('pricePerKWh',0.28,'22:00:00','23:59:00'),
 timedPart('pricePerKWh',0.28,'00:00:00','08:59:00'),conflictPart]),null);

console.log('EnergyVision strict 45/360 post-charge and 1080 connected family oracles PASS');
