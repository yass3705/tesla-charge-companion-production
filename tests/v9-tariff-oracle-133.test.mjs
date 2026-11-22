import assert from 'node:assert/strict';
import {simpleOracle} from '../scripts/v9_tariff_oracle_133.mjs';
const session={energyKwh:20,durationMinutes:60,chargingMinutes:45,postChargeMinutes:15};
const offer={currency:'EUR',pricing:{type:'rules',rules:[{scope:'allDay',start:'00:00',end:'24:00',
  pricePerKwh:.3,pricePerMinute:.01,chargePerMinute:.02,idlePerMinute:.04,connectionFee:1,sessionFeeEur:.5}]}};
assert.equal(simpleOracle(offer,session).total,9.6,'independent energy + connected + charge + parking + fixed arithmetic');
assert.deepEqual(Object.keys(simpleOracle(offer,session).components).sort(),
  ['chargingTime','connectedTime','connectionFee','energy','parkingTime','sessionFee']);
assert.equal(simpleOracle({currency:'GBP',pricing:{type:'kwh',pricePerKwh:.5}},session).total,10);
assert.equal(simpleOracle({pricing:{type:'rules',rules:[{scope:'timeWindow',start:'07:00',end:'23:00',pricePerKwh:.3}]}},session),null,
  'time windows require an independent timeline oracle');
assert.equal(simpleOracle({pricing:{type:'rules',rules:[{scope:'allDay',afterMinutesRate:.2,pricePerKwh:.3}]}},session),null,
  'afterMinutes semantics must not be guessed');
assert.equal(simpleOracle({pricing:{type:'rules',rules:[{scope:'allDay',congestionTimePerMinute:.5,pricePerKwh:.3}]}},session),null,
  'congestion must be tied to a proved SOC timeline');
console.log('V9 independent tariff oracle #133 OK');
