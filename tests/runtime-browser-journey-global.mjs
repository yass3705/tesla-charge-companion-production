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
  // The shell probes these optional overlays and has explicit fallbacks.
  if(/\/runtime\/data\/v9\/(?:electra-direct-france|base-dates)\.json$/.test(new URL(r.url()).pathname))return;
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
  await page.evaluate(()=>{
    document.querySelector('nav button[data-tab="compare"]')?.click();
    document.getElementById('compare')?.classList.add('active');
    document.querySelectorAll('details.v9-filter-group').forEach(group=>{group.open=true;});
  });
  assert.equal(await page.locator('#v9TeslaOnly').textContent(),'Tesla uniquement');
  assert.equal(await page.locator('#v9AllNetworks').textContent(),'Tous les réseaux');
  assert.equal(await page.evaluate(()=>window.TCCV9ProductionShell.readInputs(window).operatorMode),'all','All networks are selected on first page load');
  assert.equal(await page.locator('#v9OperatorDropdown').count(),1,'operator dropdown is available');
  assert.equal(await page.locator('#v9OperatorDropdown').isVisible(),true,'CPO multi-selection is visible without opening a submenu');
  assert.equal(await page.locator('details.v9-filter-group').filter({has:page.locator('#v9OperatorDropdown')}).count(),0,'CPO selection has no collapsible submenu');
  assert.equal(await page.locator('#simPowerAc').count(),1,'AC checkbox is beside power range');
  assert.equal(await page.locator('#simPowerDc').count(),1,'DC checkbox is beside power range');
  await page.waitForFunction(()=>document.querySelector('#results')?.textContent?.includes('Saisis une adresse'),null,{timeout:30000});
  await page.locator('#simOrigin').fill('47.61764, 9.2688');
  await page.locator('#v9TeslaOnly').click();
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
  await page.locator('.v9-view-map').click();
  assert.ok(await page.locator('#v9MapZones img[src*="tile.openstreetmap.org"]').count()>0,'Geographic map must load OpenStreetMap tile images');
  assert.ok(await page.locator('#v9MapZones .v9-map-marker').count()>0,'Geographic map must retain station markers');
  assert.ok(await page.locator('#v9MapZones .v9-map-marker').filter({hasText:/\d+,\d{2} CHF/}).count()>0,
    'Swiss map markers must show the simulated session total in CHF');
  await page.locator('#v9MapZones .v9-map-marker').first().click();
  if(await page.locator('#v9MapSelected .v9-map-choice').count())await page.locator('#v9MapSelected .v9-map-choice').first().click();
  assert.equal(await page.locator('#v9MapSelected').isVisible(),true,'Selecting a marker reveals the charging station');
  assert.ok((await page.locator('#v9MapSelected').innerText()).length>20,'Selected map point includes tariff details');
  await page.locator('.v9-map-open-row').click();
  assert.equal(await page.locator('#results').isVisible(),true,'Map selection can open the station result');
  await page.locator('#v9AllNetworks').click();
  await page.evaluate(()=>window.compare());
  await page.waitForFunction(()=>document.querySelectorAll('#v9OperatorDropdown input[type=checkbox]').length>1,null,{timeout:120000});
  const choices=page.locator('#v9OperatorDropdown input[type="checkbox"]');
  assert.ok(await choices.count()>1,'Network selector must expose multiple choices beside shortcut buttons');
  await choices.nth(0).check();await choices.nth(1).check();
  assert.equal(await page.evaluate(()=>window.TCCV9ProductionShell.readInputs(window).operatorMode),'selected','Network edits apply immediately');
  await choices.nth(0).uncheck();
  assert.equal(await choices.nth(0).isChecked(),false,'Network checkbox changes apply immediately');
  assert.equal(await page.locator('.v9-operator-apply,.v9-operator-cancel').count(),0);
  await page.evaluate(()=>{
    window.__subscriptionApplyCalls=0;
    window.TCCV9ProductionShell.renderSubscriptionSelector({
      document:window.document,localStorage:window.localStorage,
      setTimeout:window.setTimeout.bind(window),clearTimeout:window.clearTimeout.bind(window),
      compare:()=>{window.__subscriptionApplyCalls++;}
    },[
      {id:'fastned-gold',label:'Fastned Gold',provider:'Fastned',monthlyFeeEur:5.99},
      {id:'atlante-go',label:'Atlante Go',provider:'Atlante',monthlyFeeEur:9.99}
    ],'FR',[]);
  });
  const subscriptions=page.locator('#v9SubscriptionChoices input[type=checkbox]');
  assert.equal(await subscriptions.count(),2,'subscription plans appear as a visible multiple-choice list');
  await subscriptions.nth(0).check();await subscriptions.nth(1).check();
  assert.deepEqual(await page.evaluate(()=>window.TCCV9ProductionShell.selectedSubscriptions(window)),['fastned-gold','atlante-go']);
  await page.waitForFunction(()=>window.__subscriptionApplyCalls>=1);
  await subscriptions.nth(0).uncheck();
  assert.deepEqual(await page.evaluate(()=>window.TCCV9ProductionShell.selectedSubscriptions(window)),['atlante-go']);
  await page.evaluate(()=>window.TCCV9ProductionShell.renderSubscriptionSelector({
    document:window.document,localStorage:window.localStorage,
    setTimeout:window.setTimeout.bind(window),clearTimeout:window.clearTimeout.bind(window),compare:()=>{}
  },window.TCCV9ProductionShell.subscriptionOptionsForArea({stations:[{physicalOperator:{id:'electra',name:'Electra'},offers:[]}]},'FR'),'FR',[]));
  await page.locator('#v9SubscriptionChoices input[value="electra-plus-essential"]').check();
  await page.locator('#v9SubscriptionChoices input[value="electra-plus-smart"]').check();
  assert.equal(await page.locator('#v9SubscriptionChoices input[value="electra-plus-essential"]').isChecked(),false,'Electra+ plans are mutually exclusive');
  assert.equal(await page.locator('#v9SubscriptionChoices input[value="electra-plus-smart"]').isChecked(),true);
  assert.equal(await page.locator('.v9-sub-apply,.v9-sub-cancel').count(),0);
  // Verify the actual DOM toggle independently of other CPO/eMSP lanes.
  await page.evaluate(()=>{
    const ui=window.TCCV9ProductionShell;
    const st={id:'SOC80-BROWSER',physicalOperator:{name:'Electra'},evses:[{id:'EVSE-1',connectors:[{id:'CCS-1',kind:'DC',powerKw:150}]}],offers:[
      {id:'direct',provider:'Electra',kind:'direct',pricing:{type:'rules',rules:[{pricePerKwh:.5,congestionTimePerMinute:.1}]}},
      {id:'evr',provider:'Electroverse',kind:'roaming',pricing:{type:'rules',rules:[{pricePerKwh:.6}]}}
    ]};
    const quote={chargingConnectorId:'CCS-1',best:{offerId:'evr',provider:'Electroverse',kind:'roaming',total:9.5,currency:'EUR',targetCurrency:'EUR',comparable:true},
      alternatives:[{offerId:'direct',provider:'Electra',kind:'direct',total:10,currency:'EUR',targetCurrency:'EUR',comparable:true,result:{totalEur:10},congestion:{available:true,totalWithoutCongestion:8,sourceCurrencyTotalWithout:8,thresholdSoc:80,thresholdSource:'default_soc80',minutes:10}}],incomplete:[]};
    const el=document.createElement('div');el.id='v9CongestionBrowserTest';el.innerHTML=ui.renderTariffs(quote,st,{EUR:1});document.body.appendChild(el);
    const direct=el.querySelector('[data-v9-lane-label="Direct"]'),other=el.querySelector('[data-v9-lane-label="Electroverse"]'),toggle=direct?.querySelector('.v9-congestion-toggle');
    if(!toggle||toggle.getAttribute('aria-pressed')!=='true'||direct.querySelector('.v9-lane-amount')?.textContent!=='10,00 €')throw Error('Congestion default UI missing');
    toggle.click();
    if(toggle.getAttribute('aria-pressed')!=='false'||direct.querySelector('.v9-lane-amount')?.textContent!=='8,00 €'||other.querySelector('.v9-lane-amount')?.textContent!=='9,50 €'||!direct.classList.contains('v9-best-tariff'))throw Error('Congestion toggle does not update the right lane');
    toggle.click();
    if(toggle.getAttribute('aria-pressed')!=='true'||direct.querySelector('.v9-lane-amount')?.textContent!=='10,00 €'||!other.classList.contains('v9-best-tariff'))throw Error('Congestion re-enable failed');
    el.remove();
  });
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
  evidence.shellState=shellState;
  console.error(JSON.stringify({scenarioFailure:err.message,evidence,mockCalls,pageErrors:failures}));
  throw err;
}finally{
  await browser.close();
}
