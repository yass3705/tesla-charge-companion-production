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
let shellState=null;
try{
  await page.goto('http://127.0.0.1:8765/v9-production-shell/',{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForFunction(()=>!!window.__TCC_V9_SHELL__,null,{timeout:30000});
  // Frozen RC1 still contains the stable PWA update checker, which may perform
  // one versioned self-reload shortly after pageshow. Let that settle, then
  // require the V9 shell and stable data bootstrap again before interacting.
  await page.waitForTimeout(1200);
  await page.waitForFunction(()=>window.__TCC_V9_SHELL__?.ready===true||window.__TCC_V9_SHELL__?.error,null,{timeout:120000});
  shellState=await page.evaluate(()=>({marker:window.__TCC_V9_SHELL__,config:window.__TCC_V9_SHELL_CONFIG__,compareType:typeof window.compare,operatorFilter:!!document.querySelector('#simOperatorFilter')}));
  assert.equal(shellState.marker?.error,undefined,shellState);
  assert.equal(shellState.marker?.ready,true,shellState);
  assert.equal(shellState.operatorFilter,true,shellState);
  const networkUi=await page.evaluate(()=>({
    quickButtons:['#v9TeslaOnly','#v9AllNetworks'].every(selector=>!!document.querySelector(selector)),
    dropdown:!!document.querySelector('#v9OperatorDropdown'),
    adjacent:[...document.querySelector('#v9OperatorControls')?.children||[]].map(el=>el.id),
    outerHeadings:document.querySelectorAll('#compare summary').length,
    networkHeadings:[...document.querySelectorAll('#compare summary')].filter(el=>el.textContent.includes('Réseaux affichés')).length,
    obsoleteNlButtons:[...document.querySelectorAll('button')].filter(el=>/pays-bas|dot-nl/i.test(el.textContent)).length
  }));
  assert.equal(networkUi.quickButtons,true,JSON.stringify(networkUi));
  assert.equal(networkUi.dropdown,true,JSON.stringify(networkUi));
  assert.deepEqual(networkUi.adjacent,['v9TeslaOnly','v9AllNetworks','v9OperatorDropdown']);
  assert.equal(networkUi.networkHeadings,1,JSON.stringify(networkUi));
  assert.equal(networkUi.obsoleteNlButtons,0,JSON.stringify(networkUi));
  await page.waitForFunction(()=>document.querySelectorAll('#v9BaseUpdates table tbody tr').length>=10,null,{timeout:15000});
  await page.locator('#v9UsageHelpTab').click();
  assert.equal(await page.locator('#v9UsageHelp').evaluate(el=>el.classList.contains('active')),true);
  assert.ok((await page.locator('#v9UsageHelp').innerText()).includes('Prix non disponible'));
  await page.locator('nav button[data-tab="compare"]').click();
  await page.waitForFunction(()=>document.querySelector('#results')?.textContent?.includes('Saisis une adresse'),null,{timeout:30000});
  await page.locator('#simOrigin').fill('47.61764, 9.2688');
  const openFilterGroupFor=async id=>{
    const group=page.locator('details.v9-filter-group').filter({has:page.locator('#'+id)});
    await group.locator('summary').first().click();
  };
  await openFilterGroupFor('simOperatorFilter');
  await openFilterGroupFor('simMaxDistance');
  await page.locator('#simMaxDistance').fill('100');
  await openFilterGroupFor('simNow');
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
  assert.ok(result.text.includes('Aucune borne V9 exploitable'),JSON.stringify(result));
  assert.equal(result.diagnostics[0]?.outcome,'v9-ok',result);
  assert.equal(result.diagnostics[0]?.countryCode,'CH',result);
  assert.ok(mockCalls.reverse>0);
  assert.equal(mockCalls.route,0);
  assert.deepEqual(failures,[]);
  console.log(JSON.stringify({ok:true,scenario:'CH Altnau empty-result fallback',...result,mockCalls,pageErrors:failures}));
}catch(err){
  const evidence=await page.evaluate(()=>({
    status:document.getElementById('routeStatus')?.textContent,
    results:document.getElementById('results')?.innerText?.slice(0,500),
    diagnostics:localStorage.getItem('tccV9ProductionShellDiagnosticsV1'),consoleMessages,requestFailures
  })).catch(()=>({consoleMessages,requestFailures}));
  evidence.shellState=shellState;
  console.error(JSON.stringify({scenarioFailure:err.message,evidence,mockCalls,pageErrors:failures}));
  throw err;
}finally{
  await browser.close();
}
