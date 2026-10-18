import test from 'node:test';
import assert from 'node:assert/strict';
import {createTariffShadow,PIN} from '../scripts/v9_tariff_shadow_133.mjs';
const input={pin:PIN,country:'FR',cpo:'Electra',channel:'Electra',evseId:'exact-pdc',connectorId:'exact-connector',offerId:'exact-offer'};
test('shadow is off by default and never alters the current result',()=>{
  const current=Object.freeze({status:'uncomputable',reason:'saturation_unverified'});
  let called=false;const shadow=createTariffShadow();
  assert.equal(shadow.observe(input,current,()=>{called=true;return{status:'priced',total:12.2}}),current);
  assert.equal(called,false);
});
test('exact cohort emits minimised deltas and rollback stops evaluation immediately',()=>{
  const events=[];let calls=0;
  const shadow=createTariffShadow({enabledCohorts:[input],emit:x=>events.push(x)});
  const current=Object.freeze({status:'priced',total:10,currency:'EUR',components:{energy:10},sourceId:'current'});
  const candidate=()=>{calls++;return{status:'priced',total:11,currency:'EUR',components:{energy:11},sourceId:'candidate'}};
  assert.equal(shadow.observe({...input,pin:'other'},current,candidate),current);
  assert.equal(shadow.observe({...input,channel:'Direct'},current,candidate),current);
  assert.equal(shadow.observe(input,current,candidate),current);
  assert.equal(calls,1);assert.equal(events.length,1);
  assert.deepEqual(events[0].difference,{status:false,amount:true,currency:false,components:true,provenance:true});
  assert.deepEqual(shadow.metrics(),{evaluations:1,errors:0,status:0,amount:1,currency:0,components:1,provenance:1});
  assert.equal(JSON.stringify(events).includes('exact-pdc'),false);
  assert.equal(JSON.stringify(events).includes('exact-offer'),false);
  shadow.rollback();assert.equal(shadow.observe(input,current,candidate),current);assert.equal(calls,1);
});
