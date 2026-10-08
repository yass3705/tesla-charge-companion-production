import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const ui=require('../v9-production-shell/bridge.js');
const data=require('../runtime-overrides/assets/v9/data-engine.js');
const compact=require('../runtime-overrides/assets/v9/adapters/france-emsp-compact.js');

const station=(id,power=150)=>({
  id,countryCode:'FR',name:'Site test',address:'1 rue de test',
  latitude:48.801,longitude:2.100,physicalOperator:{id:'testcpo',name:'Test CPO'},
  evses:[{id:'EVSE-'+id,pdcIds:['PDC-'+id],connectors:[{id:'CON-'+id,kind:'DC',powerKw:power}]}],
  offers:[]
});
const evaluated=(offerId,provider,kind,total,pricing,extra={})=>({
  offerId,provider,kind,currency:'EUR',targetCurrency:'EUR',total,
  comparable:total!=null,result:{complete:total!=null,totalEur:total,...(total==null?{reason:'complex_not_evaluable'}:{})},
  ...extra
});
const direct=evaluated('d','Direct CPO','direct',5,{type:'simple',pricePerKwh:0.5});
const electraA=evaluated('e1','Electra','roaming',6,{type:'simple',pricePerKwh:0.6});
const electraB=evaluated('e2','Electra','roaming',7,{type:'simple',pricePerKwh:0.7});
const electroverse=evaluated('v','Electroverse','roaming',8,{type:'simple',pricePerKwh:0.8});
const s=station('a');
s.offers=[
  {id:'d',provider:'Direct CPO',kind:'direct',pricing:{pricePerKwh:0.5}},
  {id:'e1',provider:'Electra',kind:'roaming',pricing:{pricePerKwh:0.6}},
  {id:'e2',provider:'Electra',kind:'roaming',pricing:{pricePerKwh:0.7}},
  {id:'v',provider:'Electroverse',kind:'roaming',pricing:{pricePerKwh:0.8}}
];
const evaluation={best:direct,alternatives:[electraA,electraB,electroverse],incomplete:[]};
const lane=ui.tariffLaneState(evaluation,s,'electra');
assert.equal(lane.status,'ambiguous');
assert.equal(ui.tariffLaneState(evaluation,s,'direct').status,'priced');
assert.equal(ui.tariffLaneState(evaluation,s,'electroverse').status,'priced');
const rendered=ui.renderTariffs(evaluation,s,{EUR:1},['my-subscription']);
assert.match(rendered,/Tarif ambigu à vérifier auprès de l’opérateur/);
assert.match(rendered,/Tarif non disponible/);
assert.ok(rendered.indexOf('Direct')<rendered.indexOf('my-subscription')&&rendered.indexOf('my-subscription')<rendered.indexOf('Electra'),'selected subscription must be between direct and Electra');
assert.match(rendered,/5,00 €/);
assert.match(rendered,/8,00 €/);
const pricedA={station:s,evaluation:{best:direct,alternatives:[electraA,electroverse],incomplete:[]},distanceKm:2,total:5};
const s2=station('b');s2.offers=s.offers;
const pricedB={station:s2,evaluation:{best:direct,alternatives:[electraB,electroverse],incomplete:[]},distanceKm:2,total:5};
assert.equal(ui.groupRows([pricedA,pricedB]).length,2,'different Electra tariffs at same site and power must not be grouped');
const s3=station('c');s3.offers=s.offers;
assert.equal(ui.groupRows([pricedA,{station:s3,evaluation:pricedA.evaluation,distanceKm:2,total:5}]).length,1,'identical tariffs at same power may be grouped');
const ch={...s,countryCode:'CH'};
const swiss={...direct,currency:'CHF',targetCurrency:'CHF',total:5.25,result:{totalEur:5.25,complete:true}};
const chMarkup=ui.renderTariffs({best:swiss,alternatives:[],incomplete:[]},ch,{CHF:1.05});
assert.match(chMarkup,/5,25 CHF/);
assert.match(chMarkup,/≈ 5,00 €/);
assert.equal(ui.tariffLaneState({best:null,alternatives:[],incomplete:[]},s,'electra').status,'missing');
const nonComputable={...electroverse,total:null,comparable:false,result:{complete:false,reason:'unknown_component'}};
assert.equal(ui.tariffLaneState({best:null,alternatives:[],incomplete:[nonComputable]},s,'electroverse').status,'unresolved');
assert.match(ui.renderTariffs({best:null,alternatives:[],incomplete:[nonComputable]},s,{}),/Tarif à vérifier auprès de l’opérateur/);

// Legacy compact migration must never silently discard competing power/EVSE tariffs.
const tariffRow=price=>['allDay','00:00','24:00','kwh','EUR',price,0,0,0,0,0,null,[]];
const sourceRow=['FR-S', 'Site test','1 rue de test',48.801,2.100,'Test CPO',2,0,[
  ['a','Electra · DC 150 kW','DC',150,1,[tariffRow(.42)],['EVSE-a']],
  ['b','Electra · DC 150 kW','DC',150,1,[tariffRow(.53)],['EVSE-a']]
]];
const compactRules=compact.offerRulesFromRows([sourceRow]);
assert.equal(compactRules.length,2,'conflicting Electra records must be kept');
assert.ok(compactRules.every(x=>x.metadata.tariffAmbiguous===true&&x.evseIds.includes('EVSE-a')));

// A failed tariff overlay is diagnostic only; it may not block the other platforms.
const base={id:'national',countries:['FR'],capabilities:['inventory'],priority:{identity:100},active:true};
const broken={id:'direct-broken',countries:['FR'],capabilities:['tariff'],optional:false,active:true};
const electro={id:'electro',countries:['FR'],capabilities:['tariff'],optional:false,active:true,priority:{tariff:80}};
const electra={id:'electra',countries:['FR'],capabilities:['tariff'],optional:false,active:true,priority:{tariff:90}};
const engine=data.createEngine({registry:{sources:[base,broken,electro,electra]},loaders:{
 national:async()=>[station('a')],
 'direct-broken':async()=>{throw new Error('test provider outage')},
 electro:async()=>({offerRules:[{id:'v',provider:'Electroverse',offerKind:'roaming',evseIds:['EVSE-a'],countries:['FR'],pricing:{pricePerKwh:.6}}]}),
 electra:async()=>({offerRules:[{id:'e',provider:'Electra',offerKind:'roaming',evseIds:['EVSE-a'],countries:['FR'],pricing:{pricePerKwh:.5}}]})
}});
const area=await engine.queryArea({countryCode:'FR'});
assert.equal(area.stations.length,1);
assert.deepEqual(area.stations[0].offers.map(o=>o.provider).sort(),['Electra','Electroverse']);
assert.ok(area.diagnostics.errors.some(e=>e.sourceId==='direct-broken'));
console.log('OK V9: tariffs kept per EVSE/power; ambiguous independent lanes; CHF/EUR; subscriptions and overlay-failure isolation');
