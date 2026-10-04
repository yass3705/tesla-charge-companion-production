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
const electra=html.indexOf('<strong style="font-size:14px;line-height:1.3">Electra · MEILLEUR TARIF</strong>');
const electroverse=html.indexOf('<strong style="font-size:14px;line-height:1.3">Electroverse</strong>');
assert.ok(direct>=0&&direct<electra&&electra<electroverse,'fixed order must be Direct, Electra, Electroverse');
assert.equal((html.match(/MEILLEUR TARIF/g)||[]).length,1,'only the lowest available category is highlighted');
assert.ok(html.includes('background:#f4a64a'),'Direct uses orange');
assert.ok(html.includes('background:#a8e8d4'),'Electra uses light teal');
assert.ok(html.includes('background:#c9b3f4'),'Electroverse uses violet');

const missing=ui.renderTariffs({best:null,alternatives:[],incomplete:[]});
assert.equal((missing.match(/Prix non disponible/g)||[]).length,3,'all three categories remain visible without prices');

assert.equal(ui.stationBaseSource({countryCode:'FR'}),'IRVE');
assert.equal(ui.stationBaseSource({countryCode:'BE'}),'NAP Belgique');
assert.equal(ui.stationBaseSource({countryCode:'FR',physicalOperator:{name:'Tesla Supercharger'}}),'TESLA · SuC Tracker');
const teslaHtml=ui.renderTariffs({best:{total:8,targetCurrency:'EUR'}},{physicalOperator:{name:'Tesla Supercharger'}});
assert.ok(teslaHtml.includes('Tesla'));
assert.ok(!teslaHtml.includes('Electra')&&!teslaHtml.includes('Electroverse'),'third-party categories are not shown for Tesla stations');

console.log(JSON.stringify({ok:true,priceCategories:['Direct','Electra','Electroverse'],sourceLabels:true}));
