import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const shell=require('../v9-production-shell/bridge.js');

const scope=['FR','IT','CH','DE','ES','NL','GB','MA','BE'];
assert.equal(shell.countryQueryMode('FR',scope,[]),'full');
assert.equal(shell.countryQueryMode('PT',scope,[]),'tesla-only');
assert.equal(shell.countryQueryMode('PT',scope,['tesla']),'tesla-only');
assert.throws(()=>shell.countryQueryMode('PT',scope,['other-cpo']),/outside V9 shell scope/);

const seen=[];
const w={
  resolveOrigin:async()=>({lat:41.182,lon:-8.689,label:'Matosinhos'}),
  sessionStorage:{getItem:()=>null,setItem:()=>{}},
  localStorage:{getItem:()=>null},
  fetch:async()=>({ok:true,json:async()=>({address:{country_code:'pt'}})}),
  TCCV9SessionPlannerEngine:{planStation:()=>{}},
  TCCV9SessionEngine:{evaluateStation:()=>{},offerMatchesChargingKind:()=>false},
  TCCV9StationScoreEngine:{scoreStation:()=>{}}
};
const tesla={id:'PT:tesla:matosinhos',countryCode:'PT',name:'Tesla Matosinhos, Portugal',physicalOperator:{id:'tesla',name:'Tesla'},evses:[]};
const engine={__tccFxRates:{EUR:1},queryArea:async request=>{
  seen.push(request);
  return{stations:[tesla],rankedStations:[],sessionEvaluations:{},stationScores:{},routes:{byStationId:{}}};
}};
const input={originText:'Matosinhos',radiusKm:30,startSoc:25,targetSoc:80,startAt:'2026-10-13T12:00:00+01:00',operatorIds:[],rankingMode:'balanced'};
const run=await shell.executeV9(w,engine,{mode:'candidate',engineScopeCountries:scope},input);
assert.equal(run.countryCode,'PT');
assert.deepEqual(seen[0].filters.operatorIds,['tesla'],'outside the nine-country scope, only Tesla may enter V9');
assert.equal(run.area.stations[0].name,'Tesla Matosinhos, Portugal');
assert.equal(seen[0].radiusKm,30);
console.log(JSON.stringify({ok:true,country:'PT',operatorIds:seen[0].filters.operatorIds}));
