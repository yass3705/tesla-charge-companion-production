import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {stationCards}=require('../v9-production-shell/bridge.js');

const ids=['FRELCP12954082','FRELCP5265355','FRELCPBDALE'];
function variant(id,index,power,kind){
  const pdc=`${id}:PDC:${index}`;
  const item={offerId:`${id}:offer:${index}`,kind:'direct',provider:'Electra',total:index+1,
    comparable:true,result:{complete:true,totalEur:index+1}};
  return {station:{id,countryCode:'FR',name:"Bois-d'Arcy - E.Leclerc",
    address:"11 avenue Jean Jaurès, 78390 Bois-d'Arcy",latitude:48.799557,longitude:2.039009,
    physicalOperator:{name:'Electra'},evses:[{id:`${id}:EVSE:${index}`,pdcIds:[pdc],
      connectors:[{id:`${pdc}:connector`,kind,powerKw:power}]}],offers:[{id:item.offerId}]},
    powerLine:{kind,powerKw:power,count:1},evaluation:{best:item,alternatives:[],incomplete:[]},
    distanceKm:2,total:index+1};
}
const rows=[
  ...Array.from({length:17},(_,i)=>variant(ids[0],i,i<4?22:i===4?100:400,i<4?'AC':'DC')),
  variant(ids[1],0,100,'DC'),
  ...Array.from({length:10},(_,i)=>variant(ids[2],i,22,'AC')),
];
const before=new Set(rows.map(row=>row.station.id));
const after=stationCards(rows);
assert.equal(before.size,3);
assert.equal(after.length,1);
assert.equal(after[0].pointCount,28);
assert.deepEqual(after[0].powerGroups.map(g=>[g.kind,g.powerKw,g.pointCount]),
  [['AC',22,14],['DC',100,2],['DC',400,12]]);
assert.equal(after[0].variants.length,28);
assert.equal(after[0].rankingChoices.length,28,'every PDC keeps its own evaluated offer');
assert.equal(new Set(after[0].rankingChoices.map(choice=>choice.row.evaluation.best.offerId)).size,28);
assert.equal(stationCards([...rows].reverse())[0].stationKey,after[0].stationKey);

for(const change of [
  row=>{row.station.latitude=48.8;},
  row=>{row.station.physicalOperator.name='Other CPO';},
  row=>{row.station.countryCode='BE';},
  row=>{row.station.id='FR-NEIGHBOUR';},
]){
  const neighbour=structuredClone(rows[0]);change(neighbour);
  assert.equal(stationCards([rows[0],neighbour]).length,2);
}
for(const country of ['ES','DE','IT','CH','GB','NL','BE','MA']){
  const one=structuredClone(rows[0]),two=structuredClone(rows[17]);
  one.station.countryCode=country;two.station.countryCode=country;
  assert.equal(stationCards([one,two]).length,2,`${country}: no cross-country implicit join`);
}
console.log('V9 physical site identity #132 OK');
