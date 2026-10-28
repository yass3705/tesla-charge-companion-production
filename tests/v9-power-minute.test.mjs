import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,existsSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import path from 'node:path';
import {runInNewContext} from 'node:vm';
const require=createRequire(import.meta.url);
const site=process.argv[2];
const root=site?path.resolve(site,'runtime/assets/v9'):path.resolve('runtime-overrides/assets/v9');
const pricing=require(path.join(root,'pricing-engine.js'));
const context={TCCV9PricingEngine:pricing,TCCV9OfferEngine:require('../runtime-owned/assets/v9/offer-engine.js')};
runInNewContext(readFileSync(path.join(root,'session-engine.js'),'utf8'),context);
const sessions=context.TCCV9SessionEngine;
const adapter=require(path.join(root,'adapters/tesla-json.js'));
const shell=require('../v9-production-shell/bridge.js');
const scopedRaw={id:'ma-scope',countryCode:'MA',powerKw:150,pricing:{type:'rules',rules:[
  {billing:'powerMinute',currency:'MAD',powerBands:[{minKw:0,maxKw:60,ratePerMinute:1.1},
    {minKw:60,maxKw:180,ratePerMinute:3.5}]}]}};
const scoped=adapter.normalizeStation(scopedRaw);
assert.equal(scoped.offers[0].pricing.rules[0].pricePerMinute,3.5);
assert.equal(scoped.offers[0].currency,'MAD');
assert.equal(scoped.offers[0].metadata.timeZone,'Africa/Casablanca');
assert.equal(adapter.provedMoroccoPowerMinute(scopedRaw,scoped).length,1);
assert.equal(adapter.provedMoroccoPowerMinute({...scopedRaw,countryCode:'FR'},scoped).length,0);
assert.equal(adapter.provedMoroccoPowerMinute({...scopedRaw,pricing:{type:'rules',rules:[{billing:'powerMinute',currency:'EUR'}]}},scoped).length,0);
const rule={scope:'allDay',billing:'powerMinute',currency:'MAD',pricePerKwh:0,
 powerBands:[{minKw:0,maxKw:60,ratePerMinute:1},{minKw:60,maxKw:1000,ratePerMinute:2}]};
const offer={id:'synthetic',provider:'Tesla',kind:'direct',currency:'MAD',metadata:{timeZone:'Africa/Casablanca'},pricing:{type:'rules',rules:[rule]}};
const session={startAt:'2026-10-26T12:00:00Z',durationMinutes:2,chargingMinutes:1,postChargeMinutes:1,energyKwh:1,
 powerSegments:[{startMin:0,endMin:.25,powerKw:50},{startMin:.25,endMin:1,powerKw:60}]};
const quote=(o=offer,s=session)=>pricing.evaluateOffer(o,s);
const total=(r,n)=>{assert.equal(r.complete,true,JSON.stringify(r));assert.equal(r.totalEur,n);};
total(quote(),1.75);
total(quote(offer,{...session,chargingMinutes:1.000001,powerSegments:[
  {startMin:0,endMin:.500001,powerKw:50},{startMin:.5,endMin:1.000001,powerKw:60}]}),1.500001);
assert.equal(quote(offer,{...session,powerSegments:undefined,powerKw:250}).reason,'delivered_power_curve_required');
assert.equal(quote(offer,{...session,powerSegments:[{startMin:0,endMin:.5,powerKw:50}]}).complete,false);
assert.equal(quote(offer,{...session,powerSegments:[{startMin:0,endMin:.75,powerKw:50},{startMin:.5,endMin:1,powerKw:60}]}).complete,false);
assert.equal(quote(offer,{...session,powerSegments:[{startMin:0,endMin:1,powerKw:1001}]}).complete,false);
total(quote(offer,{...session,powerSegments:[{startMin:0,endMin:1,powerKw:1000}]}),2);
assert.equal(pricing.evaluateRule(rule,session).complete,false);
const capped=structuredClone(offer);capped.pricing.minimumTotalEur=3;capped.pricing.rules[0].minimumSessionEur=2.5;
total(quote(capped),3);
assert.equal(shell.feeBreakdown(quote().components).reduce((s,r)=>s+r.amount,0),1.75);
assert.match(shell.tariffRateLabels(offer).join(' '),/kW délivrés/);
assert.ok(!shell.tariffRateLabels(offer).join(' ').includes('/kWh'));
assert.ok(!shell.appliedTariffRateLabels({currency:'MAD',result:quote()},offer).join(' ').includes('/kWh'));
const timed=structuredClone(offer);timed.metadata.timeZone='UTC';timed.pricing.rules=[
 {...rule,scope:'timeWindow',start:'00:00',end:'13:00'},
 {...rule,scope:'timeWindow',start:'13:00',end:'24:00',powerBands:rule.powerBands.map(b=>({...b,ratePerMinute:b.ratePerMinute*3}))}];
total(quote(timed,{...session,startAt:'2026-10-26T12:59:45Z'}),4.75);
const locked=structuredClone(timed);locked.pricing.priceSelectionBasis='session_start_local_time';
total(quote(locked,{...session,startAt:'2026-10-26T12:59:45Z'}),1.75);
const station={id:'synthetic-station',countryCode:'MA',evses:[{id:'e',connectors:[{id:'c',kind:'DC',powerKw:250}]}],offers:[offer]};
const stationQuote=sessions.evaluateStation(station,session,{targetCurrency:'MAD'});
assert.equal(stationQuote.best?.total,1.75,JSON.stringify(stationQuote));
if(site){
 const file=path.resolve(site,'runtime/data/tesla_stations.json');
 const raw=JSON.parse(existsSync(file)?readFileSync(file):gunzipSync(readFileSync(file+'.gz')));
 let count=0;
 for(const source of raw){
  const st=adapter.normalizeStation(source),before=JSON.stringify(source);
  for(const o of st.offers.filter(o=>o.pricing.rules.some(r=>r.billing==='powerMinute'))){
   const durations=[5,6,7,8],powers=[30,80,140,200];let offset=0;
   const segments=durations.map((d,i)=>{const row={startMin:offset,endMin:offset+d,powerKw:powers[i]};offset+=d;return row;});
   const s={...session,durationMinutes:30,chargingMinutes:26,postChargeMinutes:4,powerSegments:segments,stationTimeZone:'Africa/Casablanca'};
   total(quote(o,s),source.id==='tesla-casablanca-morocco'?97.8:91.8);assert.equal(quote(o,s).currency,'MAD');count++;
  }
  assert.equal(JSON.stringify(source),before);
 }
 assert.ok(count>0);console.log(JSON.stringify({archivedOffers:count,expectedNativeTotal:91.8,sourceUnchanged:true}));
}
console.log('Delivered power, exact fractional/time boundaries, native currency, minima, guards and UI PASS');
