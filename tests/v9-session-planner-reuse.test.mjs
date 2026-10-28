import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const charge=require('../runtime-owned/assets/v9/charge-model-engine.js');
const planner=require('../runtime-owned/assets/v9/session-planner-engine.js');
const station={id:'FR:reuse',evses:[{id:'evse-1',connectors:[{id:'connector-1',kind:'DC',powerKw:150}]}]};
const session={startAt:'2026-10-28T12:00:00Z',batteryCapacityKwh:80,startSoc:20,targetSoc:80,
  vehicleMaxDcKw:150,consumptionKwhPer100Km:18};
const original=charge.estimate;
let calls=0;
charge.estimate=(...args)=>{calls++;return original(...args);};
try{
  const ordinary=planner.planStation(station,session);
  assert.equal(calls,1,'identical desired and actual estimate is reused');
  assert.deepEqual(ordinary.chargeModel,ordinary.desiredChargeModel);
  assert.equal(ordinary.targetReached,true);
  const baseline=original(station,{...session,arrivalSoc:ordinary.arrivalSoc,
    targetSoc:ordinary.actualTargetSoc,energyKwh:ordinary.deliveredEnergyKwh});
  assert.deepEqual(ordinary.chargeModel,baseline,'reused model has identical timeline and amount inputs');

  calls=0;
  const shortened=planner.planStation(station,{...session,disconnectAt:'2026-10-28T12:05:00Z'});
  assert.equal(shortened.targetReached,false);
  assert.ok(calls>1,'deadline-limited charge still recomputes the actual SOC model');
  assert.notDeepEqual(shortened.chargeModel,shortened.desiredChargeModel);
}finally{charge.estimate=original;}
console.log('V9 planner identical charge model reuse and deadline guard PASS');
