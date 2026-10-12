import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const adapter=require('../runtime-overrides/assets/v9/adapters/netherlands-dotnl.js');
const pricing=require('../runtime-overrides/assets/v9/pricing-engine.js');
const DAYS=[0,1,2,3,4,5,6];
const rule=(start,end,energy,timePerMin,fee=0,parkPerMin=0,steps={})=>['timeWindow',start,end,'kwh','EUR',energy,timePerMin,fee,parkPerMin,0,0,DAYS,[],steps];
const mkOffer=rules=>{
  const row=['NL:EFL:test','EFL Test','Eindhoven',51.44,5.48,'EFL',1,null,
    [['cfg-1','Type2','AC',22,1,rules]],'2026-10-11T10:00:00Z','IN_SERVICE'];
  const site=adapter.normalizeRow(row);assert.ok(site);
  assert.equal(site.offers.length,1);
  return site.offers[0];
};
const base={timeZone:'Europe/Amsterdam',startAt:'2026-10-11T16:30:00+02:00',
            energyKwh:10,durationMinutes:60,chargingMinutes:60,postChargeMinutes:0};

{
  const offer=mkOffer([rule('00:00','16:00',.5417,.41/60),rule('16:00','22:00',.5717,.41/60),rule('22:00','24:00',.5417,.41/60)]);
  let out=pricing.evaluateOffer(offer,base);
  assert.equal(out.complete,true,JSON.stringify(out));
  assert.ok(Math.abs(out.totalEur-(10*.5717+.41))<1e-5,JSON.stringify(out));
  const cross=pricing.evaluateOffer(offer,{...base,startAt:'2026-10-11T21:30:00+02:00',energyKwh:10,durationMinutes:120,chargingMinutes:120});
  assert.equal(cross.complete,true,JSON.stringify(cross));
  assert.ok(cross.segmented,JSON.stringify(cross));
  assert.ok(Math.abs(cross.totalEur-(2.5*.5717+7.5*.5417+.82))<1e-4,JSON.stringify(cross));
}
{
  const offer=mkOffer([rule('00:00','24:00',.57,0,0,0,{energyStepWh:1000})]);
  assert.equal(pricing.evaluateOffer(offer,{...base,energyKwh:1.2}).totalEur,1.14);
}
{
  const offer=mkOffer([rule('00:00','24:00',0,.1,0,1.45/60,{chargingTimeStepSeconds:900,parkingTimeStepSeconds:900})]);
  const result=pricing.evaluateOffer(offer,{...base,energyKwh:0,durationMinutes:6,chargingMinutes:6,postChargeMinutes:8});
  assert.equal(result.complete,true,JSON.stringify(result));
  assert.ok(Math.abs(result.totalEur-(1.5+0.3625))<1e-5,JSON.stringify(result));
}
{
  const offer=mkOffer([rule('00:00','18:00',.46,0,.5),rule('18:00','21:00',.48,0,1.25),rule('21:00','24:00',.46,0,.5)]);
  const result=pricing.evaluateOffer(offer,{...base,startAt:'2026-10-11T17:30:00+02:00',durationMinutes:120,chargingMinutes:120,energyKwh:10});
  assert.equal(result.complete,true,JSON.stringify(result));
  assert.ok(Math.abs(result.totalEur-(2.5*.46+7.5*.48+.5))<1e-5,JSON.stringify(result));
}
{
  const row=(id,operator)=>[id,'Site','Amsterdam',52.37,4.9,operator,1,null,
    [['cfg-1','Type2','AC',22,1,[rule('00:00','24:00',.3,0)]]],
    '2026-10-12T10:00:00Z','IN_SERVICE'];
  assert.equal(adapter.normalizeRow(row('NL:CPI:NLCPIL7424365','ChargePoint')),null,
    'UPS site has no verified public access in the compact feed');
  assert.equal(adapter.normalizeRow(row('NL:CPI:NLCPIL6620135','ChargePoint')),null,
    'other CPI sites share the missing access evidence');
  assert.ok(adapter.normalizeRow(row('NL:EFL:test','EFL')),
    'non-Target operators continue to load');
}
console.log('DOT-NL OCPI exact costs, duration rounds, conditional FLAT and cross-midnight boundary: PASS');
