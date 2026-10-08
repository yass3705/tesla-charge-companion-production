import assert from 'node:assert/strict';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const root=path.resolve(process.argv[2]||'dist/v9-global-preview');
const data=require(path.join(root,'runtime/assets/v9/data-engine.js'));
const operator={id:'test-cpo',name:'Test CPO'};
const stations=[
  {id:'station-A',countryCode:'FR',physicalOperator:operator,evses:[{id:'evse-A'}],aliases:['alias-A'],offers:[]},
  {id:'station-B',countryCode:'FR',physicalOperator:operator,evses:[{id:'evse-B'}],aliases:['alias-B'],offers:[]}
];
const provider={id:'test-provider',priority:{tariff:95}};
const rule=(id,rest={})=>({rule:{id,provider:'Test',countries:['FR'],currency:'EUR',pricing:{pricePerKwh:0.25},...rest},source:provider});
const entries=[
  rule('generic'),
  rule('by-A',{stationIds:['station-A']}),
  rule('by-B',{evseIds:['evse-B']}),
  rule('both-yes',{stationIds:['station-A'],evseIds:['evse-A']}),
  rule('both-no',{stationIds:['station-A'],evseIds:['evse-B']}),
  rule('alias',{stationIds:['alias-B']}),
  rule('absent',{evseIds:['evse-missing']})
];
const out=data.applyOfferRules(stations,entries);
assert.deepEqual(out[0].offers.map(x=>x.id).sort(),['by-A','both-yes','generic']);
assert.deepEqual(out[1].offers.map(x=>x.id).sort(),['alias','by-B','generic']);
const many=[...entries];
for(let i=0;i<12000;i++)many.push(rule('other-'+i,{evseIds:['missing-'+i]}));
const test=data.applyOfferRules(stations,many);
assert.deepEqual(test.map(s=>s.offers.map(o=>o.id)),out.map(s=>s.offers.map(o=>o.id)));
console.log('OK: indexed station/EVSE scoped offers preserve direct and generic matching; 12000 unmatched offers excluded');
