import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const ui=require('../v9-production-shell/bridge.js');
const station={id:'lot3-example',name:'Station',countryCode:'FR',latitude:48.8,longitude:2.3,physicalOperator:{id:'tesla',name:'Tesla'},evses:[{id:'EVSE1',pdcIds:['PDC1'],connectors:[{kind:'DC',powerKw:150}]}]};
const priced=(id,provider,kind,total,extra={})=>({offerId:id,provider,kind,total,currency:'EUR',targetCurrency:'EUR',comparable:true,result:{complete:true,totalEur:total},...extra});
const direct=priced('direct','Tesla','direct',10,{congestion:{available:true,totalWithoutCongestion:8,sourceCurrencyTotalWithout:8,thresholdSoc:80,thresholdSource:'default_soc80',minutes:5}});
const electra=priced('electra','Electra','roaming',12);
const unresolved={offerId:'electroverse',provider:'Electroverse',kind:'roaming',total:null,comparable:false,result:{complete:false,reason:'missing_price'}};
station.offers=[{id:'direct',provider:'Tesla',kind:'direct',pricing:{pricePerKwh:.4},metadata:{source:'SuC Tracker'}},{id:'electra',provider:'Electra',kind:'roaming',pricing:{pricePerKwh:.5}}];
const markup=ui.renderTariffs({best:direct,alternatives:[electra],incomplete:[unresolved]},station,{EUR:1});
assert.match(markup,/Congestion incluse/);
assert.match(markup,/Tarif incalculable/);
assert.match(markup,/Détail du tarif · Direct/);
assert.match(markup,/Détail du tarif · Electra/);
const style={id:null,textContent:''};
ui.installV9MobileLayout({document:{getElementById:()=>null,createElement:()=>style,head:{appendChild(){}}}});
await mkdir('artifacts',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try {
 for(const [name,width,height] of [['desktop',1280,900],['mobile',390,844]]){
  const page=await browser.newPage({viewport:{width,height}});
  await page.setContent('<!doctype html><html lang="fr"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:18px;background:#121920;color:white;font:16px system-ui}.box{max-width:720px;margin:auto}'+style.textContent+'</style></head><body><main class="box">'+markup+'</main></body></html>');
  assert.equal(await page.locator('.v9-tariff-row').count(),3);
  assert.equal(await page.locator('.v9-tariff-row[data-v9-tariff-state="priced"]').count(),2);
  assert.equal(await page.locator('.v9-tariff-row[data-v9-tariff-state="unresolved"]').count(),1);
  await page.locator('.v9-tariff-detail').first().locator('summary').click();
  assert.equal(await page.locator('.v9-tariff-detail').first().evaluate(e=>e.open),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,name+' horizontal overflow');
  await page.screenshot({path:'artifacts/lot3-tariff-'+name+'.png'});
  await page.close();
 }
}finally{await browser.close();}
console.log('V9 Lot 3 tariff desktop/mobile browser OK');
