import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require=createRequire(import.meta.url);
const ui=require('../v9-production-shell/bridge.js');

const html=ui.renderTariffs({
  best:{offerId:'evr-1',provider:'Electroverse',kind:'emsp',total:4.2,targetCurrency:'EUR',currency:'EUR',result:{totalEur:4.2}},
  alternatives:[
    {offerId:'electra-1',provider:'Electra',kind:'emsp',total:5.1,targetCurrency:'EUR',currency:'EUR',result:{totalEur:5.1}},
    {offerId:'direct-1',provider:'Fastned',kind:'direct',total:6.3,targetCurrency:'EUR',currency:'EUR',result:{totalEur:6.3}}
  ],
  incomplete:[]
});
const direct=html.indexOf('<strong style="font-size:14px;line-height:1.3">Direct</strong>');
const electra=html.indexOf('<strong style="font-size:14px;line-height:1.3">Electra</strong>');
const electroverse=html.indexOf('<strong style="font-size:14px;line-height:1.3">Electroverse · MEILLEUR TARIF</strong>');
assert.ok(direct>=0&&direct<electra&&electra<electroverse,'fixed order must be Direct, Electra, Electroverse');
assert.equal((html.match(/MEILLEUR TARIF/g)||[]).length,1,'only the lowest available category is highlighted');
assert.ok(html.includes('background:#f4a64a'),'Direct uses orange');
assert.ok(html.includes('background:#a8e8d4'),'Electra uses light teal');
assert.ok(html.includes('background:#c9b3f4'),'Electroverse uses violet');

const withSubscription=ui.renderTariffs({best:{offerId:'electra-essential',provider:'Electra+ Essential',kind:'subscription',subscriptionId:'electra-plus-essential',total:4.9,targetCurrency:'EUR',currency:'EUR',result:{totalEur:4.9}},alternatives:[
  {offerId:'electra-public',provider:'Electra direct',kind:'direct',total:5.9,targetCurrency:'EUR',currency:'EUR',result:{totalEur:5.9}},
  {offerId:'electra-platform',provider:'Electra',kind:'emsp',total:6.3,targetCurrency:'EUR',currency:'EUR',result:{totalEur:6.3}}
],incomplete:[]});
assert.ok(withSubscription.indexOf('>Direct</strong>')<withSubscription.indexOf('>Electra+ Essential')&&withSubscription.indexOf('>Electra+ Essential')<withSubscription.indexOf('>Electra</strong>'),'selected subscription must occupy its own row between direct and Electra');
assert.ok(withSubscription.includes('5,90 €')&&withSubscription.includes('4,90 €'),'both public and membership prices remain visible');

const missing=ui.renderTariffs({best:null,alternatives:[],incomplete:[]});
assert.equal((missing.match(/Prix non disponible/g)||[]).length,3,'all three categories remain visible without prices');
assert.ok(missing.includes('Aucune correspondance Electroverse vérifiée'),'missing Electroverse source must be explained');

assert.equal(ui.stationBaseSource({countryCode:'FR'}),'IRVE');
assert.equal(ui.stationBaseSource({countryCode:'BE'}),'NAP Belgique');
assert.equal(ui.stationBaseSource({countryCode:'FR',physicalOperator:{name:'Tesla Supercharger'}}),'TESLA · SuC Tracker');
const teslaHtml=ui.renderTariffs({best:{total:8,targetCurrency:'EUR'}},{physicalOperator:{name:'Tesla Supercharger'}});
assert.ok(teslaHtml.includes('Tesla'));
assert.ok(!teslaHtml.includes('Electra')&&!teslaHtml.includes('Electroverse'),'third-party categories are not shown for Tesla stations');


const emptyPowerFields={simNow:{value:'20'},simTarget:{value:'80'},simDate:{value:''},simTime:{value:''},simUnplugTime:{value:''},simMaxDistance:{value:'20'},simOperatorFilter:{value:'',dataset:{v9Mode:'all'}},simPowerType:{multiple:true,selectedOptions:[]},simMinPowerKw:{value:''},simMaxPowerKw:{value:''},simCondition:{value:'normal'},simProfile:{value:'realistic'},simRanking:{value:'balanced'}};
const emptyPowerInputs=ui.readInputs({document:{getElementById:id=>emptyPowerFields[id]||null}});
assert.equal(emptyPowerInputs.minPowerKw,null,'blank minimum power must mean no minimum filter');
assert.equal(emptyPowerInputs.maxPowerKw,null,'blank maximum power must mean no maximum filter');
assert.deepEqual(ui.areaFiltersFromInputs(emptyPowerInputs),{},'empty power inputs must not filter stations');
const lullyOffer={id:'lully-direct',provider:'Electric 55 Charging',kind:'direct',currency:'EUR',pricing:{type:'rules',rules:[
  {scope:'timeWindow',start:'09:00',end:'11:00',pricePerKwh:0.30},
  {scope:'timeWindow',start:'11:00',end:'15:00',pricePerKwh:0.35}
]}};
const appliedLully={station:{id:'lully',name:'PLACE LULLY',evses:[{id:'p1',connectors:[{id:'c1',kind:'AC',powerKw:22}]}],offers:[lullyOffer]},
  evaluation:{best:{offerId:'lully-direct',provider:'Electric 55 Charging',kind:'direct',currency:'EUR',total:3.5,result:{components:{compactMinute:{segments:[{rule:lullyOffer.pricing.rules[1]}]}}}}}};
const lullyHtml=ui.renderPowerLines(appliedLully);
assert.ok(lullyHtml.includes('0,35'),'base rate must include the rule applied by the session');
assert.ok(!lullyHtml.includes('0,30'),'other tariff windows must not appear as an applied base rate');

const acFields={...emptyPowerFields,simPowerAc:{checked:true},simPowerDc:{checked:false}};
const acInputs=ui.readInputs({document:{getElementById:id=>acFields[id]||null}});
assert.deepEqual(acInputs.connectorKinds,['AC'],'AC checkbox must drive the runtime filter');
const bothFields={...emptyPowerFields,simPowerAc:{checked:true},simPowerDc:{checked:true}};
assert.deepEqual(ui.readInputs({document:{getElementById:id=>bothFields[id]||null}}).connectorKinds,['AC','DC']);
const dataEngine=require('../runtime-overrides/assets/v9/data-engine.js');
const mixedStation={physicalOperator:{name:'Example'},evses:[
  {connectors:[{kind:'AC',powerKw:22}]},{connectors:[{kind:'DC',powerKw:150}]}
]};
assert.equal(dataEngine.stationMatchesFilters(mixedStation,{connectorKinds:['AC'],minPowerKw:100}),false,'AC and minimum power must match the same connector');
assert.equal(dataEngine.stationMatchesFilters(mixedStation,{connectorKinds:['DC'],minPowerKw:100}),true);
const acVariant={powerLine:{kind:'AC',powerKw:22}},dcVariant={powerLine:{kind:'DC',powerKw:150}};
assert.equal(ui.variantMatchesFilters(acVariant,{connectorKinds:['DC']}),false,'AC result rows must be hidden when DC alone is checked');
assert.equal(ui.variantMatchesFilters(dcVariant,{connectorKinds:['DC'],minPowerKw:100,maxPowerKw:200}),true);
assert.equal(ui.variantMatchesFilters(dcVariant,{connectorKinds:['AC','DC'],maxPowerKw:100}),false,'power range must also filter rendered rows');
const subscriptionOptions=ui.subscriptionOptionsForArea({stations:[{offers:[
  {id:'fastned-gold',subscriptionId:'fastned-gold',provider:'Fastned Gold',countries:['FR'],metadata:{monthlyFeeEur:5.99}},
  {id:'electroverse',provider:'Electroverse',kind:'emsp'}
]}]},'FR');
assert.deepEqual(subscriptionOptions.map(option=>option.id),['fastned-gold'],'only verified subscriptions appear in the selection list');
assert.equal(subscriptionOptions[0].monthlyFeeEur,5.99);

console.log(JSON.stringify({ok:true,priceCategories:['Direct','Electra','Electroverse'],sourceLabels:true,blankPowerFilters:true}));
