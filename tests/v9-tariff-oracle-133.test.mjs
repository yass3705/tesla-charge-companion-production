import assert from 'node:assert/strict';
import {independentOracle,simpleOracle} from '../scripts/v9_tariff_oracle_133.mjs';

const session={startAt:'2026-10-15T12:00:00Z',stationTimeZone:'UTC',energyKwh:20,
  durationMinutes:60,chargingMinutes:45,postChargeMinutes:15,targetCurrency:'EUR'};
const offer={currency:'EUR',pricing:{type:'rules',rules:[{scope:'allDay',start:'00:00',end:'24:00',
  pricePerKwh:.3,pricePerMinute:.01,chargePerMinute:.02,idlePerMinute:.04,connectionFee:1,sessionFeeEur:.5}]}};
assert.equal(simpleOracle(offer,session).total,9.6);
assert.deepEqual(independentOracle(offer,session).components,
  {energy:6,connectedTime:.6,chargingTime:.9,parkingTime:.6,afterMinutes:0,
   connectionFee:1,sessionFee:.5,congestion:0,postChargeFee:0});

const windows={currency:'EUR',pricing:{type:'rules',timeZone:'Europe/Paris',rules:[
  {scope:'timeWindow',start:'00:00',end:'02:00',currency:'EUR',pricePerMinute:.1},
  {scope:'timeWindow',start:'03:00',end:'24:00',currency:'EUR',pricePerMinute:.2}]}};
const spring={...session,startAt:'2026-03-29T00:30:00Z',energyKwh:0,durationMinutes:90,chargingMinutes:90,postChargeMinutes:0};
assert.equal(independentOracle(windows,spring).components.connectedTime,15,'spring gap has no fabricated local hour');
const fallOffer={currency:'EUR',pricing:{type:'rules',timeZone:'Europe/Paris',rules:[
  {scope:'timeWindow',start:'02:00',end:'03:00',currency:'EUR',pricePerMinute:.2}]}};
const fall={...spring,startAt:'2026-10-25T00:30:00Z',durationMinutes:60,chargingMinutes:60};
assert.equal(independentOracle(fallOffer,fall).components.connectedTime,12,'repeated fall hour billed twice in UTC timeline');

const delayed={currency:'EUR',pricing:{type:'rules',timeZone:'Europe/Paris',rules:[{scope:'allDay',
  currency:'EUR',afterMinutesRate:.1,afterMinutesThreshold:60,afterMinutesComponent:'CONNECTED_TIME'}]}};
assert.equal(independentOracle(delayed,{...session,energyKwh:0,durationMinutes:90,chargingMinutes:90,postChargeMinutes:0}).components.afterMinutes,3);
assert.equal(independentOracle({...delayed,pricing:{...delayed.pricing,rules:[{...delayed.pricing.rules[0],afterMinutesComponent:undefined}]}},session).reason,
  'after_minutes_component_unverified');
const capped={currency:'EUR',pricing:{type:'rules',timeZone:'Europe/Paris',rules:[{scope:'allDay',currency:'EUR',
  afterMinutesRate:.1,afterMinutesThreshold:0,afterMinutesComponent:'CONNECTED_TIME',
  afterMinutesCap:4,afterMinutesCapMode:'night_window_local_per_night',afterMinutesCapStart:'20:00',afterMinutesCapEnd:'08:00'}]}};
assert.equal(independentOracle(capped,{...session,startAt:'2026-10-15T19:00:00Z',energyKwh:0,
  durationMinutes:120,chargingMinutes:120,postChargeMinutes:0}).components.afterMinutes,4);

const post={currency:'EUR',pricing:{type:'rules',rules:[{scope:'allDay',currency:'EUR',pricePerKwh:.2}],
  postChargeFee:{graceMinutes:5,eurPerMinute:.2},minimumTotalEur:8}};
const postResult=independentOracle(post,session);
assert.equal(postResult.components.postChargeFee,2);
assert.equal(postResult.total,8);
assert.equal(postResult.components.minimumTopUp,2);
assert.equal(independentOracle({...post,pricing:{...post.pricing,maximumTotalEur:7}},session).reason,'invalid_maximum');
assert.equal(independentOracle({...post,subscriptionId:'club'},session).status,'ineligible');
assert.equal(independentOracle({...post,subscriptionId:'club'},{...session,selectedSubscriptionId:'club'}).status,'priced');

const congested={id:'offer-a',currency:'EUR',connectorIds:['plug-1'],pricing:{type:'rules',rules:[{
  scope:'allDay',currency:'EUR',congestionTimePerMinute:.5,congestionStartSoc:80}]}};
const soc={...session,energyKwh:0,durationMinutes:75,chargingMinutes:60,postChargeMinutes:15,
  startSoc:75,targetSoc:85,batteryCapacityKwh:75,linearSocVerified:true};
assert.equal(independentOracle(congested,soc,{connectorId:'plug-1'}).components.congestion,22.5);
assert.equal(independentOracle(congested,{...soc,congestionOffBy:['offer-a|plug-1']},{connectorId:'plug-1'}).components.congestion,0);
assert.equal(independentOracle(congested,{...soc,linearSocVerified:false},{connectorId:'plug-1'}).reason,
  'congestion_soc_timeline_unverified');
assert.equal(independentOracle(congested,soc,{connectorId:'plug-2'}).reason,'congestion_connector_scope_mismatch');

const gbp={currency:'GBP',pricing:{type:'kwh',pricePerKwh:.5}};
const fx={date:'2026-10-15',base:'EUR',sourceSha256:'3dcfdc149289a0d3ddbfc22ca2a93501bcce29dbe1a26e186f1141b260d1eda6',
  rates:{EUR:1,GBP:.845514}};
const converted=independentOracle(gbp,{...session,fxEvidence:fx});
assert.equal(converted.total,10);
assert.equal(converted.convertedTotal,Math.round(10/.845514*1e6)/1e6);
assert.equal(independentOracle(gbp,session).fxStatus,'missing_verified_dated_rate');
const midhope={currency:'GBP',connectorIds:['midhope-1'],pricing:{type:'connected_kerb_midhope_guest_verified',
  energyPerKwhGbp:.39996,parkingPerStarted30minGbp:.80004,idleSupplementPerMinuteGbp:.01}};
const midhopeResult=independentOracle(midhope,{...session,stationTimeZone:'Europe/London'},
  {connectorId:'midhope-1'});
assert.equal(midhopeResult.total,9.74928);
assert.equal(independentOracle(midhope,{...session,startAt:'2026-10-25T12:00:00Z'},
  {connectorId:'midhope-1'}).status,'priced');
const mac={currency:'MAD',pricing:{type:'rules',rules:[{scope:'allDay',currency:'MAD',billing:'powerMinute',
  powerBands:[{minKw:0,maxKw:60,ratePerMinute:1.1},{minKw:60,maxKw:100,ratePerMinute:2.3},
              {minKw:100,maxKw:180,ratePerMinute:3.5},{minKw:180,maxKw:1000,ratePerMinute:6}] }]}};
assert.equal(independentOracle(mac,{...session,stationTimeZone:'Africa/Casablanca'},{powerKw:150}).total,157.5);
assert.equal(independentOracle(mac,{...session,stationTimeZone:'Africa/Casablanca'}).reason,'power_band_connector_power_missing');
const metropolis={currency:'EUR',pricing:{type:'rules',timeZone:'Europe/Paris',rules:[
  {scope:'allDay',currency:'EUR',pricePerKwh:.63,energyRounding:'started_kwh'}],
  postChargeFee:{graceMinutes:10,blockMinutes:1,blockEur:.2,rounding:'started_block'}}};
const metropolisResult=independentOracle(metropolis,{...session,energyKwh:20.2});
assert.equal(metropolisResult.components.energy,13.23);
assert.equal(metropolisResult.components.postChargeFee,1);
assert.equal(metropolisResult.total,14.23);
console.log('V9 independent tariff oracle #133 phase 2 OK');
