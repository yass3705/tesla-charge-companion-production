import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {rankRows}=require('../v9-production-shell/bridge.js');

const row=(id,total,distanceKm,time,costPerKm,extra={})=>({station:{id,name:id},total,distanceKm,costPerKm,
  score:time==null?null:{totalTimeMinutes:time},evaluation:{best:total==null?null:{total,comparable:true,result:{complete:true}}},...extra});
const rows=[row('cheap-far',10,20,80,.05),row('near-expensive',20,2,90,.08),row('fast',15,10,30,.06),row('no-price',null,1,20,null),row('estimated',5,1,25,.02,{distanceEstimated:true})];
assert.deepEqual(rankRows(rows,'price').map(x=>x.station.id),['estimated','cheap-far','fast','near-expensive','no-price']);
assert.deepEqual(rankRows(rows,'distance').map(x=>x.station.id),['near-expensive','fast','cheap-far','estimated','no-price']);
assert.deepEqual(rankRows(rows,'totalTime').map(x=>x.station.id),['estimated','fast','cheap-far','near-expensive','no-price']);
assert.deepEqual(rankRows(rows,'costPerKm').map(x=>x.station.id),['estimated','cheap-far','fast','near-expensive','no-price']);
assert.equal(rankRows(rows,'balanced')[4].station.id,'no-price');
console.log(JSON.stringify({ok:true,sorts:['price','distance','totalTime','costPerKm'],unpricedLast:true}));
