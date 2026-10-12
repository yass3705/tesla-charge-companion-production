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
assert.match(rendered,/Tarif incalculable/);
assert.match(rendered,/Prix non disponible/);
assert.ok(rendered.indexOf('Direct')<rendered.indexOf('my-subscription')&&rendered.indexOf('my-subscription')<rendered.indexOf('Electra'),'selected subscription must be between direct and Electra');
assert.match(rendered,/5,00 €/);
assert.match(rendered,/8,00 €/);
assert.equal((rendered.match(/Prix calculé/g)||[]).length,2,'only complete Direct and Electroverse lanes have calculated prices');
assert.doesNotMatch(rendered,/Prix calculé · Tarif incalculable/);
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
const evidencedFx=ui.verifiedExchangeRates({base:'EUR',date:'2026-10-11',checkedAt:'2026-10-11T10:17:12Z',source:'dated exchange provider',rates:{EUR:1,CHF:.93,GBP:.85}});
assert.equal(evidencedFx.CHF,.93);
const unverifiedFx=ui.verifiedExchangeRates({rates:{EUR:1,CHF:.945922}});
assert.deepEqual(unverifiedFx,{EUR:1},'undated hard-coded fallback cannot convert a CHF quote');
assert.match(ui.displayAmount(swiss,unverifiedFx),/conversion en € non disponible/);
assert.equal(ui.tariffLaneState({best:null,alternatives:[],incomplete:[]},s,'electra').status,'missing');
const nonComputable={...electroverse,total:null,comparable:false,result:{complete:false,reason:'unknown_component'}};
assert.equal(ui.tariffLaneState({best:null,alternatives:[],incomplete:[nonComputable]},s,'electroverse').status,'unresolved');
assert.match(ui.renderTariffs({best:null,alternatives:[],incomplete:[nonComputable]},s,{}),/Tarif incalculable/);
assert.equal(ui.tariffLaneState({best:null,alternatives:[],incomplete:[nonComputable]},s,'electroverse').diagnostics[0].reason,'unknown_component');
assert.doesNotMatch(ui.renderTariffs({best:null,alternatives:[],incomplete:[nonComputable]},s,{}),/MEILLEUR TARIF/);
const invalidTotal={...nonComputable,total:1,comparable:true};
assert.equal(ui.tariffLaneState({best:invalidTotal,alternatives:[],incomplete:[]},s,'electroverse').status,'unresolved','a numeric total with an incomplete result is not a price');
assert.equal(ui.consistentLaneEvaluation({best:invalidTotal,alternatives:[],incomplete:[]},s,[]).best,null);
const tesla={...station('tesla'),physicalOperator:{name:'Tesla'}};
assert.match(ui.renderTariffs({best:invalidTotal,alternatives:[],incomplete:[]},tesla,{}),/Tarif incalculable/,'an incomplete Tesla total cannot be displayed as a price');
assert.match(ui.renderTariffs({best:null,alternatives:[],incomplete:[]},tesla,{}),/Prix non disponible/);
const emptyTesla=ui.renderTariffs({best:null,alternatives:[],incomplete:[]},tesla,{});
assert.equal((emptyTesla.match(/class="v9-tariff-row/g)||[]).length,3,'Tesla must retain Direct, Electra and Electroverse lanes when prices are absent');
for(const lane of ['Direct','Electra','Electroverse'])assert.match(emptyTesla,new RegExp(`data-v9-lane-label="${lane}"`));
const pricedTesla=ui.renderTariffs({best:evaluated('tesla-price','Tesla','direct',8,{pricePerKwh:.4}),alternatives:[],incomplete:[]},tesla,{});
assert.match(pricedTesla,/Direct · MEILLEUR TARIF/);
assert.equal((pricedTesla.match(/Prix non disponible/g)||[]).length,2);
assert.match(pricedTesla,/Prix calculé · 8,00 €/);
const detailedFeeOffer={id:'fee-direct',provider:'Belib',kind:'direct',currency:'EUR',pricing:{type:'rules',rules:[{
  scope:'allDay',pricePerKwh:.33,connectionFee:.1,sessionFeeEur:.2,connectedTimeComponentEur:.3,
  connectedTimeBlockMinutes:15,connectedTimeBlockEur:.57,minimumSessionEur:2,ocpiDurationBands:[[0,60,0,.05]]
}],longConnectionFee:{thresholdMinutes:840,eurPerHourAfterThreshold:10}}};
const feeLabels=ui.tariffRateLabels(detailedFeeOffer).join(' | ');
for(const expected of ['frais de connexion','frais de session','temps connecté','15 min connectées','Minimum','0–60 min','après 840 min'])assert.ok(feeLabels.includes(expected),`missing visible component: ${expected}`);
const feeStation={...station('fees',22),offers:[detailedFeeOffer]};
const feeEvaluation={best:evaluated('fee-direct','Belib','direct',5,{}),alternatives:[],incomplete:[]};
assert.match(ui.renderTariffs(feeEvaluation,feeStation,{}),/frais de session/);
assert.match(ui.renderPowerLines({station:feeStation,evaluation:feeEvaluation}),/après 840 min/);
const otherEvse=station('other',22);
otherEvse.offers=[{id:'v-other',provider:'Electroverse',kind:'roaming',evseIds:['EVSE-other'],connectorIds:['CON-other'],pricing:{pricePerKwh:.5}}];
const otherPrice=evaluated('v-other','Electroverse','roaming',5,{pricePerKwh:.5});
assert.equal(ui.tariffLaneState({best:otherPrice,alternatives:[],incomplete:[]},otherEvse,'electroverse').status,'priced','a conflict on another EVSE, connector or power must not contaminate this lane');

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

const safe=ui.consistentLaneEvaluation(evaluation,s,[]);
assert.equal(safe.best.offerId,'d','ambiguous Electra must not be rankable');
const onlyConflict={best:electraA,alternatives:[electraB],incomplete:[]};
assert.equal(ui.consistentLaneEvaluation(onlyConflict,s,[]).best,null,'only ambiguous options must not produce a false best price');
const fastnedSubscription={id:'fastned-gold',subscriptionId:'fastned-gold',operatorAliases:['Fastned'],provider:'Fastned Gold',countries:['FR']};
const nearbyFastned={...station('near'),physicalOperator:{id:'fastned',name:'Fastned'}};
assert.ok(ui.subscriptionOptionsForArea({stations:[nearbyFastned]},'FR',[fastnedSubscription]).some(x=>x.id==='fastned-gold'));
assert.ok(!ui.subscriptionOptionsForArea({stations:[station('far')]},'FR',[fastnedSubscription]).some(x=>x.id==='fastned-gold'));
const pricing=require('../runtime-overrides/assets/v9/pricing-engine.js');
const priceAt=(rate)=>({scope:'allDay',start:'00:00',end:'24:00',pricePerKwh:rate});
const overlap=pricing.evaluateOffer({id:'overlap',currency:'EUR',pricing:{type:'rules',rules:[priceAt(.4),priceAt(.55)]}},{startAt:'2026-10-08T14:00:00Z',energyKwh:10,durationMinutes:30});
assert.equal(overlap.complete,false);
assert.equal(overlap.reason,'ambiguous_overlapping_tariff_rules');
const ambigSingle={...electroverse,total:null,comparable:false,result:overlap};
assert.equal(ui.tariffLaneState({best:null,alternatives:[],incomplete:[ambigSingle]},s,'electroverse').status,'ambiguous');
assert.equal(ui.tariffLaneState({best:null,alternatives:[],incomplete:[ambigSingle]},s,'electroverse').diagnostics[0].reason,'ambiguous_overlapping_tariff_rules');
assert.match(ui.renderTariffs({best:null,alternatives:[],incomplete:[ambigSingle]},s,{}),/Tarif incalculable/);
// Identical rule IDs from distinct tariff sources must never overwrite each other.
const baseStation=station('collision');
const collision=data.applyOfferRules([baseStation],[
 {source:{id:'first',priority:{tariff:80}},rule:{id:'same',provider:'CPO',countries:['FR'],pricing:{pricePerKwh:.3},evseIds:['EVSE-collision']}},
 {source:{id:'second',priority:{tariff:90}},rule:{id:'same',provider:'CPO',countries:['FR'],pricing:{pricePerKwh:.5},evseIds:['EVSE-collision']}}
]);
assert.equal(collision[0].offers.length,2,'two sources with same provider/ID must remain separately represented');

console.log('OK V9: tariffs kept per EVSE/power; ambiguous independent lanes; CHF/EUR; subscriptions and overlay-failure isolation');
