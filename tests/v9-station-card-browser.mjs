import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const ui=require('../v9-production-shell/bridge.js');
const style={id:null,textContent:''};
ui.installV9MobileLayout({document:{getElementById:()=>null,createElement:()=>style,head:{appendChild(){}}}});
assert.match(style.textContent,/v9-power-lane-grid/);

const station={id:'demo-physical-site',countryCode:'FR',name:'Station multi-puissances',address:'Paris',
  physicalOperator:{name:'CPO'},latitude:48.8,longitude:2.3};
const priced=(id,provider,kind,total)=>({offerId:id,provider,kind,total,currency:'EUR',targetCurrency:'EUR',
  comparable:true,result:{complete:true,totalEur:total}});
const make=(id,power,kind,price)=>{
  const items=[priced('direct-'+id,'CPO','direct',price),priced('electra-'+id,'Electra','roaming',price+1),
    priced('electroverse-'+id,'Electroverse','roaming',price+2)];
  return{station:{...station,evses:[{id:'EVSE-'+id,pdcIds:[id],connectors:[{kind,powerKw:power}],status:{state:'available'}}],
    offers:items.map(item=>({id:item.offerId,pricing:{type:'simple',pricePerKwh:item.total/10}}))},
    powerLine:{kind,powerKw:power,count:1},displayPowerKw:power,distanceKm:3,
    evaluation:{best:items[0],alternatives:items.slice(1),incomplete:[]}};
};
const card=ui.stationCards([make('PDC-22',22,'AC',4),make('PDC-50',50,'DC',6),make('PDC-150',150,'DC',9)])[0];
const html=ui.renderStationCard(card,0,{displayFxRates:{EUR:1},selectedSubscriptions:[]});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
await mkdir('artifacts',{recursive:true});
try{
  for(const [name,width,height,columns] of [['desktop',1280,900,3],['mobile',390,844,1]]){
    const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
    await page.setContent('<!doctype html><html lang="fr"><head><meta name="viewport" content="width=device-width, initial-scale=1">'+
      '<style>body{margin:0;padding:16px;background:#101820;color:#f5f5f5;font:16px system-ui}.box{box-sizing:border-box;max-width:720px;margin:auto;padding:14px;border:1px solid #34404c;border-radius:8px}.small{font-size:13px}a{color:#9dc8ee}</style><style>'+style.textContent+'</style></head><body><main id="results">'+html+'</main></body></html>');
    await page.locator('.v9-power-group').first().evaluate(element=>element.open=true);
    await page.locator('.v9-pdc-detail').first().evaluate(element=>element.open=true);
    const observed=await page.evaluate(()=>({cards:document.querySelectorAll('.v9-result-card').length,
      powers:document.querySelectorAll('.v9-power-group').length,
      lanes:document.querySelectorAll('.v9-power-group').length&&getComputedStyle(document.querySelector('.v9-power-lane-grid')).gridTemplateColumns.split(' ').length,
      scrollWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth,
      overflow:document.documentElement.scrollWidth>innerWidth}));
    await page.screenshot({path:`artifacts/station-card-${name}.png`,fullPage:true});
    assert.equal(observed.cards,1,name);
    assert.equal(observed.powers,3,name);
    assert.equal(observed.lanes,columns,name);
    assert.equal(observed.overflow,false,name+': '+JSON.stringify(observed));
    await page.close();
  }
}finally{await browser.close();}
console.log('V9 station card desktop/mobile browser OK');
