import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const page=await browser.newPage({serviceWorkers:'block'});
await page.addInitScript(()=>{localStorage.setItem('tccDefaultOrigin','47.61764, 9.2688');localStorage.setItem('tccMaxDistanceKm','100');});
const failures=[],mockCalls={reverse:0,route:0},consoleMessages=[],requestFailures=[];
page.on('pageerror',e=>failures.push(e.message));
page.on('console',msg=>consoleMessages.push(msg.type()+': '+msg.text()));
page.on('requestfailed',req=>requestFailures.push(req.url()+' :: '+(req.failure()?.errorText||'unknown')));
page.on('response',r=>{
  if(r.status()>=400&&new URL(r.url()).origin==='http://127.0.0.1:8765'&&/\/(?:runtime\/assets\/v9|runtime\/data\/v9|snapshot-inputs\/)/.test(r.url()))
    failures.push('critical local HTTP '+r.status()+': '+r.url());
});
await page.route('https://nominatim.openstreetmap.org/**',route=>{
  const url=new URL(route.request().url());
  if(url.pathname.endsWith('/reverse')){
    mockCalls.reverse++;
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({address:{country_code:'ch'},display_name:'Altnau, Schweiz'})});
  }
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{lat:'47.61764',lon:'9.2688',display_name:'Altnau, Schweiz'}])});
});
await page.route('https://router.project-osrm.org/**',route=>{
  mockCalls.route++;
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({code:'Ok',routes:[{distance:2500,duration:300}]})});
});
try{
  await page.goto('http://127.0.0.1:8765/v9-production-shell/',{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForFunction(()=>!!window.__TCC_V9_SHELL__,null,{timeout:30000});
  // Frozen RC1 still contains the stable PWA update checker, which may perform
  // one versioned self-reload shortly after pageshow. Let that settle, then
  // require the V9 shell and stable data bootstrap again before interacting.
  await page.waitForTimeout(1200);
  await page.waitForFunction(()=>!!window.__TCC_V9_SHELL__,null,{timeout:30000});
  await page.waitForFunction(()=>document.querySelector('#results')?.textContent?.includes('Saisis une adresse'),null,{timeout:30000});
  await page.locator('#simOrigin').fill('47.61764, 9.2688');
  await page.locator('#simOperatorFilter').selectOption('tesla');
  await page.locator('#simMaxDistance').fill('100');
  await page.locator('#simNow').fill('20');
  await page.locator('#simTarget').fill('80');
  assert.equal(await page.locator('#simOrigin').inputValue(),'47.61764, 9.2688');
  await page.evaluate(()=>{ window.compare(); });
  await page.waitForFunction(()=>{
    const status=document.querySelector('#routeStatus')?.textContent||'';
    const list=document.querySelector('#results')?.textContent||'';
    return status.includes('Moteur V9 canary')&&list.length>30;
  },null,{timeout:120000,polling:1000});
  const result=await page.evaluate(()=>({
    status:document.getElementById('routeStatus')?.textContent,
    cards:document.querySelectorAll('#results .box').length,
    text:document.getElementById('results')?.innerText?.slice(0,500),
    diagnostics:JSON.parse(localStorage.getItem('tccV9ProductionShellDiagnosticsV1')||'[]').slice(0,2)
  }));
  assert.ok(result.cards>0,result);
  assert.equal(result.diagnostics[0]?.outcome,'v9-ok',result);
  assert.equal(result.diagnostics[0]?.countryCode,'CH',result);
  assert.ok(mockCalls.reverse>0);
  assert.deepEqual(failures,[]);
  console.log(JSON.stringify({ok:true,scenario:'CH Altnau 20-80%, Tesla within 100km',...result,mockCalls,pageErrors:failures}));
}catch(err){
  const evidence=await page.evaluate(()=>({
    status:document.getElementById('routeStatus')?.textContent,
    results:document.getElementById('results')?.innerText?.slice(0,500),
    diagnostics:localStorage.getItem('tccV9ProductionShellDiagnosticsV1'),consoleMessages,requestFailures
  })).catch(()=>({consoleMessages,requestFailures}));
  console.error(JSON.stringify({scenarioFailure:err.message,evidence,mockCalls,pageErrors:failures}));
  throw err;
}finally{
  await browser.close();
}
