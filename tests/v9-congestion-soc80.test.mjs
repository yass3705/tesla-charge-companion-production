import assert from 'node:assert/strict';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const engine=require('../runtime-overrides/assets/v9/pricing-engine.js');
const shell=require('../v9-production-shell/bridge.js');
const root=path.resolve(process.argv[2]||'dist/v9-global-preview');
const stationEngine=require(path.join(root,'runtime/assets/v9/session-engine.js'));
const close=(a,b)=>assert.ok(Math.abs(a-b)<.00001,`expected ${a} to equal ${b}`);
const rule={scope:'allDay',start:'00:00',end:'24:00',pricePerKwh:.4,congestionTimePerMinute:.2,congestionTimeStepSeconds:300,congestionStartSoc:80,congestionThresholdSource:'default_soc80'};
const offer={id:'electra-direct:1',kind:'direct',provider:'Electra',currency:'EUR',pricing:{type:'component_groups',componentGroups:[{kind:'ENERGY+CONGESTION_TIME',rules:[rule]}]}};
const session={startAt:'2026-10-08T10:00:00Z',startSoc:75,arrivalSoc:75,targetSoc:85,energyKwh:10,durationMinutes:30,chargingMinutes:20,postChargeMinutes:10,chargeTimeline:[{offsetMinutes:0,durationMinutes:20,startSoc:75,endSoc:85,energyKwh:10,powerKw:35}]};
const priced=engine.evaluateOffer(offer,session);
assert.equal(priced.complete,true);
close(priced.totalEur,8);
const excluded=engine.evaluateOffer(offer,{...session,includeCongestionFees:false});
close(excluded.totalEur,4);
const fee=priced.components.componentGroups[0].components.congestionTime;
close(fee.chargingMinutes,10);close(fee.postChargeMinutes,10);close(fee.billableMinutes,20);
assert.equal(fee.thresholdSoc,80);
const below=engine.evaluateOffer(offer,{...session,arrivalSoc:65,targetSoc:75,chargeTimeline:[{offsetMinutes:0,durationMinutes:20,startSoc:65,endSoc:75}]});
close(below.totalEur,4);
const providedThreshold={...offer,pricing:{type:'component_groups',componentGroups:[{rules:[{...rule,congestionStartSoc:90,congestionThresholdSource:'official'}]}]}};
close(engine.evaluateOffer(providedThreshold,session).totalEur,4);
const stepped={...offer,pricing:{type:'component_groups',componentGroups:[{rules:[{...rule,congestionTimeStepSeconds:900}]}]}};
close(engine.evaluateOffer(stepped,session).totalEur,10); // 20min => 30min billable
const segmented=engine.evaluateOffer({id:'segmented',currency:'EUR',pricing:{type:'rules',rules:[{...rule,scope:'timeWindow',start:'00:00',end:'10:10'},{...rule,scope:'timeWindow',start:'10:10',end:'24:00'}]}},session);
assert.equal(segmented.complete,true);
close(segmented.totalEur,8);
const unavailable=engine.evaluateOffer(offer,{energyKwh:10,durationMinutes:30});
assert.equal(unavailable.complete,false);
assert.equal(unavailable.reason,'congestion_soc_unavailable');
close(engine.evaluateOffer(offer,{energyKwh:10,durationMinutes:30,includeCongestionFees:false}).totalEur,4);
const station={id:'FR-Electra-1',countryCode:'FR',name:'Electra test',physicalOperator:{name:'Electra'},evses:[{id:'EVSE-1',connectors:[{id:'CCS-1',kind:'DC',powerKw:150}]}],offers:[offer,{id:'evr',kind:'roaming',provider:'Electroverse',currency:'EUR',pricing:{type:'rules',rules:[{scope:'allDay',pricePerKwh:.9}]}}]};
const quote=stationEngine.evaluateStation(station,session);
assert.equal(quote.best.offerId,'electra-direct:1');
close(quote.best.congestion.totalWithoutCongestion,4);
close(quote.best.congestion.feeAmount,4);
assert.equal(quote.best.congestion.thresholdSource,'default_soc80');
const markup=shell.renderTariffs(quote,station,{EUR:1});
assert.match(markup,/data-v9-congestion-key=/);
assert.match(markup,/Congestion incluse/);
assert.match(markup,/À partir de 80 % de batterie/);
assert.match(markup,/hypothèse V9/);
assert.match(markup,/Electroverse/);
assert.equal((markup.match(/v9-congestion-toggle/g)||[]).length,1,'congestion toggle must not affect other tariff lanes');
assert.ok(shell.congestionLaneKey(station,quote,'direct')!==shell.congestionLaneKey(station,quote,'electroverse'));

// Electra eMSP source duration bands are seconds; charging above SOC80 and
// elapsed-session minDuration/maxDuration must both match before billing.
const bandedRule={...rule,congestionTimeStepSeconds:null,congestionTimePerMinute:0,
  ocpiCongestionDurationBands:[[0,300,0],[300,7800,0.4]]};
const bandedOffer={...offer,pricing:{type:'component_groups',componentGroups:[{kind:'ENERGY+CONGESTION_TIME',rules:[bandedRule]}]}};
const banded=engine.evaluateOffer(bandedOffer,session);
assert.equal(banded.complete,true,banded.reason);
close(banded.totalEur,12); // 10 minutes above 80% while charging + 10 minutes idle
close(engine.evaluateOffer(bandedOffer,{...session,includeCongestionFees:false}).totalEur,4);
const earlyEnd={...session,targetSoc:79,chargeTimeline:[{offsetMinutes:0,durationMinutes:20,startSoc:70,endSoc:79}]};
close(engine.evaluateOffer(bandedOffer,earlyEnd).totalEur,4);
const overlapping={...bandedRule,ocpiCongestionDurationBands:[[0,600,.2],[300,1200,.4]]};
const unclear=engine.evaluateOffer({...offer,pricing:{type:'component_groups',componentGroups:[{rules:[overlapping]}]}},session);
assert.equal(unclear.complete,false);
assert.equal(unclear.reason,'ambiguous_overlapping_congestion_bands');
const zeroCongestion={...rule,congestionTimePerMinute:0,ocpiCongestionDurationBands:[]};
const plain=engine.evaluateOffer({...offer,pricing:{type:'rules',rules:[zeroCongestion]}},{energyKwh:10,durationMinutes:30});
assert.equal(plain.complete,true,'zero-fee tariffs do not require a SOC timeline');
close(plain.totalEur,4);

console.log('V9 congestion SOC80/toggle/independent lanes: pass');
