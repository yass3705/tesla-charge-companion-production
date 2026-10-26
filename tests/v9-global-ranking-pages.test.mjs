import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),mod=name=>require('../runtime-owned/assets/v9/'+name+'.js');
const {executeV9,buildSession,rowsFromArea,variantsByPower,stationCards,rankRows}=require('../v9-production-shell/bridge.js');
// Deliberately put the cheapest offer in the last source batch.
const fragments=Array.from({length:321},(_,i)=>({canonicalId:`FR:fixture:${String(i).padStart(4,'0')}`,countryCode:'FR',name:`Station ${i}`,latitude:48+i*.0001,longitude:2,
 physicalOperator:{id:'fixture',name:'Fixture'},evses:[{id:`e${i}`,connectors:[{id:`c${i}`,kind:'DC',powerKw:150}]}],
 offers:i===3?[]:[{id:`o${i}`,provider:'Fixture',kind:'direct',currency:'EUR',pricing:{type:'rules',rules:[{scope:'allDay',start:'00:00',end:'24:00',pricePerKwh:(322-i)/1000}]}}]}));
fragments[3].evses=[]; // Missing topology must not remove an unpriced physical station.
let loads=0;
const engine=mod('runtime-engine').createEngine({registry:{sources:[{id:'fixture',countries:['FR'],active:true}]},loaders:{fixture:async()=>{loads++;return fragments;}}});
const w={resolveOrigin:async()=>({lat:48,lon:2}),sessionStorage:{getItem:()=> 'FR'},localStorage:{getItem:()=>null},
 TCCV9SessionPlannerEngine:mod('session-planner-engine'),TCCV9SessionEngine:mod('session-engine'),TCCV9StationScoreEngine:mod('station-score-engine')};
const input={originText:'fixture',radiusKm:100,startSoc:20,targetSoc:80,startAt:'2026-10-26T12:00:00Z'},cfg={mode:'candidate',engineScopeCountries:['FR']};
const session=buildSession(input,'FR');session.fxRates={};
const full=await engine.queryArea({countryCode:'FR',origin:{lat:48,lon:2},radiusKm:100,filters:{},session,vehicleProfileId:'generic-ev-preview'});
const cards=stationCards(variantsByPower(w,rowsFromArea(full,{lat:48,lon:2}),full.effectiveSession,[]),[]);
assert.equal(cards.length,321);assert.ok(cards.some(c=>c.total>0),'fixture really has calculable prices');
let calls=0;const query=engine.queryArea;engine.queryArea=async q=>{calls++;assert.ok(q.stationLimit<=160,'production path never evaluates an unlimited batch');return query(q);};
for(const mode of ['price','distance','balanced','totalTime','costPerKm']){
 const expected=rankRows(cards,mode,321).map(c=>c.station.id),pages=[];
 const first=await executeV9(w,engine,cfg,{...input,rankingMode:mode});pages.push(first);
 const before=calls;
 for(const stationOffset of [160,320])pages.push(await executeV9(w,engine,cfg,{...input,rankingMode:mode,stationOffset}));
 assert.equal(calls-before,2,'page navigation reuses the full ranking');
 assert.deepEqual(pages.flatMap(p=>p.rows.map(c=>c.station.id)),expected,`${mode}: global business ranking unchanged`);
 assert.equal(first.area.mapRankingRows.length,321);
 assert.ok(first.area.mapRankingRows.every(r=>!r.station.evses&&!r.variants),'cached map summaries do not retain full cards');
 assert.equal(first.area.mapRankingRows.filter(r=>r.total!=null).length,320,'unpriced remains unpriced');
 for(const p of pages)assert.equal(p.area.mapStations.length,321);
 if(mode==='price')assert.equal(first.rows[0].station.id,'FR:fixture:0320');
}
assert.equal(loads,1,'oracle and all ranked pages reuse the same source load');
console.log('V9 global ranking: five modes match full oracle, bounded batches and cached pages PASS');

let routeCalls=0;
const routed=mod('runtime-engine').createEngine({registry:{sources:[{id:'fixture',countries:['FR'],active:true}]},loaders:{fixture:async()=>fragments},
 routeProvider:async()=>{routeCalls++;return{distanceKm:1,driveMinutes:2};}});
for(const stationOffset of [0,40,80])await routed.queryArea({countryCode:'FR',origin:{lat:48,lon:2},radiusKm:100,session,globalRouting:true,stationLimit:40,stationOffset,skipSessionEvaluation:true});
assert.equal(routeCalls,80,'routing budget is shared by the entire search, not repeated per batch');
console.log('V9 global routing cache PASS');
