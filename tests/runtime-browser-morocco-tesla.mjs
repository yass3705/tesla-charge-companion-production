import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

const {chromium}=await import(process.env.TCC_PLAYWRIGHT_MODULE?pathToFileURL(process.env.TCC_PLAYWRIGHT_MODULE).href:'playwright');
const launch=process.env.TCC_BROWSER_EXECUTABLE_PATH?{executablePath:process.env.TCC_BROWSER_EXECUTABLE_PATH}:{channel:'chrome'};
const browser=await chromium.launch({...launch,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
  for(const scenario of [
    {city:'tanger',lat:35.7595,lon:-5.834,station:'Tesla Tangier',distanceM:19400},
    {city:'casablanca',lat:33.5731,lon:-7.5898,station:'Tesla Casablanca',distanceM:8000}
  ]){
    const page=await browser.newPage({serviceWorkers:'block'}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('https://nominatim.openstreetmap.org/**',route=>{
      const reverse=new URL(route.request().url()).pathname.endsWith('/reverse');
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(reverse
        ?{address:{country_code:'ma'},display_name:scenario.city}
        :[{lat:String(scenario.lat),lon:String(scenario.lon),display_name:scenario.city}])});
    });
    await page.route('https://router.project-osrm.org/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({code:'Ok',routes:[{distance:scenario.distanceM,duration:1500}]})}));
    await page.goto((process.env.TCC_BROWSER_BASE_URL||'http://127.0.0.1:8765')+'/v9-production-shell/',{waitUntil:'domcontentloaded',timeout:45000});
    await page.waitForFunction(()=>window.__TCC_V9_SHELL__?.ready===true,null,{timeout:120000});
    const result=await page.evaluate(async city=>{
      document.querySelector('#simOrigin').value=city;
      document.querySelector('#simMaxDistance').value='30';
      document.querySelector('#simDate').value='2026-10-07';
      document.querySelector('#simTime').value='10:00';
      document.querySelector('#v9TeslaOnly').click();
      const area=await window.compare();
      return{countryCode:area?.query?.countryCode,diagnostics:JSON.parse(localStorage.getItem('tccV9ProductionShellDiagnosticsV1')||'[]')[0],cards:[...document.querySelectorAll('.v9-result-card')].map(card=>card.innerText)};
    },scenario.city);
    const card=result.cards.find(value=>value.includes(scenario.station));
    assert.equal(result.diagnostics?.outcome,'v9-ok',`${scenario.city}: ${JSON.stringify(result.diagnostics)}`);
    assert.ok(card,`${scenario.city}: Tesla station missing from results`);
    assert.match(card,/\d+[,.]\d{2} MAD \(≈ \d+[,.]\d{2} €\)/,`${scenario.city}: Tesla tariff must be displayed in MAD and EUR`);
    assert.ok(!card.includes('Prix Tesla non disponible'),`${scenario.city}: routed Tesla tariff was lost`);
    assert.ok(card.includes('MAD/min')&&!card.includes('0,00 MAD/kWh'),`${scenario.city}: Tesla power-band policy must be described without zero placeholder rates`);
    assert.deepEqual(errors,[],`${scenario.city}: browser errors`);
    console.log(JSON.stringify({city:scenario.city,station:scenario.station,tariff:card.match(/\d+[,.]\d{2} MAD \(≈ \d+[,.]\d{2} €\)/)?.[0]}));
    await page.close();
  }
}finally{await browser.close();}
