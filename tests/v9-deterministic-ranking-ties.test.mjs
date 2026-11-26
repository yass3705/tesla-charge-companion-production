import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {rankRows}=require('../v9-production-shell/bridge.js');
const make=(id,evse,connector,total,cost,dist=2,name='Même station')=>({
 station:{id,name,countryCode:'FR',evses:[{id:evse,connectors:[{id:connector,kind:'DC',powerKw:100}]}]},
 total,costPerKm:cost,distanceKm:dist,score:{totalTimeMinutes:30}
});
const rows=[make('s2','e1','c1',null,null),make('s1','e2','c2',null,null),
 make('s1','e1','c2',null,null),make('s1','e1','c1',null,null),
 make('s3','e2','c2',4,.1),make('s3','e1','c1',4,.1),make('s4','e1','c1',4,.1),
 make('s5','e1','c1',3,null),make('s6','e1','c1',2,null),make('s7','e1','c1',null,null,1)];
const key=r=>[r.station.id,r.station.evses[0].id,r.station.evses[0].connectors[0].id].join('|');
for(const mode of ['price','costPerKm','distance','balanced','totalTime']){
 const expected=rankRows(rows.slice(),mode,rows.length).map(key);
 for(const input of [rows.slice().reverse(),rows.slice(4).concat(rows.slice(0,4)),rows.slice().sort((a,b)=>key(b).localeCompare(key(a)))]){
  assert.deepEqual(rankRows(input,mode,rows.length).map(key),expected,mode);
  assert.deepEqual(rankRows(input,mode,5).map(key),expected.slice(0,5),mode+' prefix');
 }
 assert.deepEqual(expected.slice(-5),['s7|e1|c1','s1|e1|c1','s1|e1|c2','s1|e2|c2','s2|e1|c1']);
}
assert.deepEqual(rankRows(rows,'price',5).map(key),['s6|e1|c1','s5|e1|c1','s3|e1|c1','s3|e2|c2','s4|e1|c1']);
assert.deepEqual(rankRows(rows,'costPerKm',5).map(key),['s3|e1|c1','s3|e2|c2','s4|e1|c1','s6|e1|c1','s5|e1|c1']);
const cached=rows.filter(r=>r.station.id!=='s1'&&r.station.id!=='s3').map(r=>({...r,station:{id:r.station.id,name:r.station.name,countryCode:'FR'}}));
assert.deepEqual(rankRows(cached,'price',99).map(r=>r.station.id),rankRows(cached.slice().reverse(),'price',99).map(r=>r.station.id));
console.log('Deterministic rank ties, unknown tails, missing cost/km, station/EVSE/connector IDs and page prefixes PASS');
