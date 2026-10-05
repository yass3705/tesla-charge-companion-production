import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const page=await browser.newPage({serviceWorkers:'block'});
await page.addInitScript(()=>{localStorage.setItem('tccDefaultOrigin','47.61764, 9.2688');localStorage.setItem('tccMaxDistanceKm','100');window.__tccFetchAudit=[];const baseFetch=window.fetch.bind(window);window.fetch=(...args)=>baseFetch(...args).then(response=>{try{const request=args[0],url=typeof request==='string'?request:request.url;window.__tccFetchAudit.push({url:new URL(url,location.href).pathname,status:response.status});}catch(_){}return response;});});
const failures=[],mockCalls={reverse:0,route:0},consoleMessages=[],requestFailures=[];
page.on('pageerror',e=>failures.push(e.message));
page.on('console',msg=>consoleMessages.push(msg.type()+': '+msg.text()));
page.on('requestfailed',req=>requestFailures.push(req.url()+' :: '+(req.failure()?.errorText||'unknown')));
page.on('response',r=>{
  const optionalLegacyDates=r.url().includes('/runtime/data/v9/base-dates.json')&&process.env.V9_REQUIRE_BASE_DATES!=='1';
  if(r.status()>=400&&new URL(r.url()).origin==='http://127.0.0.1:8765'&&!optionalLegacyDates&&/\/(?:runtime\/assets\/v9|runtime\/data\/v9|snapshot-inputs\/)/.test(r.url()))
    failures.push('critical local HTTP '+r.status()+': '+r.url());
});
await page.route('https://nominatim.openstreetmap.org/**',route=>{
  const url=new URL(route.request().url());
  if(url.pathname.endsWith('/reverse')){
    mockCalls.reverse++;
    const lat=Number(url.searchParams.get('lat')),lon=Number(url.searchParams.get('lon')),isParis=Math.abs(lat-48.8566)<0.1&&Math.abs(lon-2.3522)<0.1;
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({address:{country_code:isParis?'fr':'ch'},display_name:isParis?'Paris, France':'Altnau, Schweiz'})});
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
  await page.evaluate(()=>document.querySelectorAll('details.v9-filter-group').forEach(group=>{group.open=true;}));
  const networkUi=await page.evaluate(()=>({
    quickButtons:['#v9TeslaOnly','#v9AllNetworks'].every(selector=>!!document.querySelector(selector)),
    bridgeCacheKey:[...document.scripts].map(script=>script.src).find(src=>/v9-production-shell\/bridge\.js/.test(src))?.match(/v9-ui-([a-f0-9]{16})/)?.[1]||null,
    operatorSelect:!!document.querySelector('#v9OperatorControls #v9OperatorDropdown > #simOperatorFilter'),
    operatorIsMultiSelect:document.querySelector('#simOperatorFilter')?.multiple===true,
    operatorChoices:[...document.querySelector('#simOperatorFilter')?.options||[]].map(option=>option.textContent.trim()),
    adjacent:[...document.querySelector('#v9OperatorControls')?.children||[]].map(el=>el.id),
    outerHeadings:document.querySelectorAll('#compare summary').length,
    networkHeadings:[...document.querySelectorAll('#compare summary')].filter(el=>el.textContent.includes('Réseaux affichés')).length,
    networkStatusBesideLabel:document.getElementById('v9ActiveNetworkFilter')?.parentElement?.tagName==='LABEL'&&document.getElementById('v9ActiveNetworkFilter')?.parentElement?.textContent.includes('Réseaux affichés'),
    batteryContainsProfile:[...document.querySelectorAll('details.v9-filter-group')].some(el=>el.querySelector('summary')?.textContent==='Batterie et objectif'&&el.contains(document.querySelector('#simProfile'))),
    compactDateFields:['simDate','simTime'].every(id=>document.getElementById(id)?.getBoundingClientRect().width<=261),
    acdcButtons:['AC','DC'].every(kind=>!!document.querySelector('.v9-power-toggle[data-power="'+kind+'"]')),
    obsoleteNlButtons:[...document.querySelectorAll('button')].filter(el=>/pays-bas|dot-nl/i.test(el.textContent)&&el.getClientRects().length>0).length
  }));
  assert.equal(networkUi.quickButtons,true,JSON.stringify(networkUi));
  assert.ok(networkUi.bridgeCacheKey,JSON.stringify(networkUi));
  assert.equal(networkUi.operatorSelect,true,JSON.stringify(networkUi));
  assert.equal(networkUi.operatorIsMultiSelect,true,JSON.stringify(networkUi));
  assert.equal(networkUi.operatorChoices.includes('Tous les réseaux'),false,JSON.stringify(networkUi));
  assert.deepEqual(networkUi.adjacent,['v9TeslaOnly','v9AllNetworks','v9OperatorDropdown']);
  assert.equal(networkUi.networkHeadings,1,JSON.stringify(networkUi));
  assert.equal(networkUi.networkStatusBesideLabel,true,JSON.stringify(networkUi));
  assert.equal(networkUi.batteryContainsProfile,true,JSON.stringify(networkUi));
  assert.equal(networkUi.compactDateFields,true,JSON.stringify(networkUi));
  assert.equal(networkUi.acdcButtons,true,JSON.stringify(networkUi));
  assert.equal(networkUi.obsoleteNlButtons,0,JSON.stringify(networkUi));
  await page.evaluate(()=>{
    const select=document.querySelector('#simOperatorFilter'),fixture=document.createElement('option');
    fixture.value='coverage-fixture';fixture.textContent='Réseau de test';select.appendChild(fixture);
    for(const option of select.options)option.selected=['tesla','coverage-fixture'].includes(option.value);
    select.dispatchEvent(new Event('change',{bubbles:true}));
    window.__operatorSelectionProbe=window.TCCV9ProductionShell.readInputs(window);
  });
  const operatorProbe=await page.evaluate(()=>window.__operatorSelectionProbe);
  assert.equal(operatorProbe.operatorMode,'selected',JSON.stringify(operatorProbe));
  assert.deepEqual(operatorProbe.operatorIds,['tesla','coverage-fixture'],JSON.stringify(operatorProbe));
  assert.match(await page.locator('#v9OperatorDropdown summary').innerText(),/Tesla, Réseau de test|Réseau de test, Tesla/);
  await page.locator('#v9AllNetworks').click();
  assert.match(await page.locator('#v9OperatorDropdown summary').innerText(),/Tous les réseaux/);
  await page.locator('.v9-power-toggle[data-power="AC"]').click();
  assert.equal(await page.locator('.v9-power-toggle[data-power="AC"]').getAttribute('aria-pressed'),'true');
  await page.locator('.v9-power-toggle[data-power="DC"]').click();
  assert.equal(await page.locator('.v9-power-toggle[data-power="DC"]').getAttribute('aria-pressed'),'true');
  await page.locator('.v9-power-toggle[data-power="AC"]').click();
  await page.locator('.v9-power-toggle[data-power="DC"]').click();
  await page.locator('#v9TeslaOnly').click();
  assert.match(await page.locator('#v9ActiveNetworkFilter').innerText(),/Tesla/);
  assert.match(await page.locator('#v9ActiveNetworkFilter').evaluate(el=>el.parentElement.innerText),/Réseaux affichés.*Tesla/);
  await page.locator('#v9AllNetworks').click();
  assert.match(await page.locator('#v9ActiveNetworkFilter').innerText(),/Tous les réseaux/);
  assert.match(await page.locator('#v9ActiveNetworkFilter').evaluate(el=>el.parentElement.innerText),/Réseaux affichés.*Tous les réseaux/);
  if(process.env.V9_REQUIRE_BASE_DATES==='1'){
    await page.waitForFunction(()=>document.querySelectorAll('#v9BaseUpdates table tbody tr').length>=10,null,{timeout:15000});
  }
  await page.locator('#v9UsageHelpTab').click();
  assert.equal(await page.locator('#v9UsageHelp').evaluate(el=>el.classList.contains('active')),true);
  assert.ok((await page.locator('#v9UsageHelp').innerText()).includes('Prix non disponible'));
  await page.locator('nav button[data-tab="compare"]').click();
  await page.evaluate(()=>{
    document.getElementById('v9UsageHelp')?.classList.remove('active');
    document.querySelector('nav button[data-tab="compare"]')?.classList.add('active');
    document.getElementById('compare')?.classList.add('active');
  });
  await page.waitForFunction(()=>document.querySelector('#compare')?.classList.contains('active'),null,{timeout:30000});
  await page.locator('#simOrigin').fill('47.61764, 9.2688');
  await page.evaluate(()=>{
    document.querySelectorAll('details.v9-filter-group').forEach(group=>{group.open=true;});
  });
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
  assert.ok(result.cards>0,JSON.stringify(result));
  assert.ok(!result.text.includes('Aucune borne V9 exploitable'),JSON.stringify(result));
  assert.equal(result.diagnostics[0]?.outcome,'v9-ok',result);
  assert.equal(result.diagnostics[0]?.countryCode,'CH',result);
  assert.ok(result.diagnostics[0]?.stationCount>0,result);
  assert.ok(result.diagnostics[0]?.rankedCount>0,result);
  assert.ok(mockCalls.reverse>0);
  assert.ok(mockCalls.route>0);
  assert.deepEqual(failures,[]);
  console.log(JSON.stringify({ok:true,scenario:'CH Altnau national tile results',...result,mockCalls,pageErrors:failures}));
  if(process.env.V9_REQUIRE_PARIS_QUERY==='1'){
    await page.locator('#simOrigin').fill('48.8566, 2.3522');
    await page.locator('#simMaxDistance').fill('20');
    const paris=await page.evaluate(async()=>{
      const started=performance.now(),area=await window.compare(),durationMs=performance.now()-started;
      const diagnostics=area?.diagnostics||{},source=diagnostics.sources?.['france-national']||null;
      window.__tccParisAreaDiagnostics={source,fragmentCount:diagnostics.fragmentCount,inRadiusCount:diagnostics.inRadiusCount,filteredCount:diagnostics.filteredCount,mergedStationCount:diagnostics.mergedStationCount,errors:diagnostics.errors||[]};
      return{source,areaStations:area?.stations?.length||0,stationLimit:area?.query?.stationLimit,durationMs,operators:area?.operators||[],inRadiusCount:diagnostics.inRadiusCount||0,filteredCount:diagnostics.filteredCount||0,filters:area?.query?.filters||{},errors:diagnostics.errors||[],status:document.querySelector('#routeStatus')?.innerText||'',visibleCards:document.querySelectorAll('#results .box').length,fetches:(window.__tccFetchAudit||[]).filter(item=>item.url.includes('/runtime/data/v9/france-static/'))};
    });
    assert.equal(paris.source?.loaded,true,JSON.stringify(paris));
    assert.ok(paris.source?.stationCount>0,JSON.stringify(paris));
    assert.equal(paris.stationLimit,500,JSON.stringify(paris));
    assert.ok(paris.areaStations<=500,JSON.stringify(paris));
    assert.ok(paris.durationMs<30000,JSON.stringify(paris));
    assert.ok(paris.inRadiusCount>0,JSON.stringify(paris));
    assert.equal(paris.filters.minPowerKw,undefined,JSON.stringify(paris));
    assert.equal(paris.filters.maxPowerKw,undefined,JSON.stringify(paris));
    assert.ok(paris.filteredCount>0,JSON.stringify(paris));
    assert.ok(paris.areaStations>0,JSON.stringify(paris));
    assert.ok(paris.visibleCards>0,JSON.stringify(paris));
    assert.ok(paris.fetches.some(item=>/france-static\/manifest\.json$/.test(item.url)&&item.status===200),JSON.stringify(paris));
    assert.ok(paris.fetches.some(item=>/france-static\/t_.*\.json\.gz$/.test(item.url)&&item.status===200),JSON.stringify(paris));
    assert.equal(paris.fetches.some(item=>item.status>=400),false,JSON.stringify(paris));
    assert.match(paris.status,/borne\(s\) classée\(s\)/,JSON.stringify(paris));
    console.log(JSON.stringify({ok:true,scenario:'FR Paris real snapshot tiles',...paris,mockCalls,pageErrors:failures}));
  }
}catch(err){
  const evidence=await page.evaluate(()=>({
    status:document.getElementById('routeStatus')?.textContent,
    results:document.getElementById('results')?.innerText?.slice(0,500),
    diagnostics:localStorage.getItem('tccV9ProductionShellDiagnosticsV1'),parisDiagnostics:window.__tccParisAreaDiagnostics||null,fetchAudit:window.__tccFetchAudit||[],consoleMessages,requestFailures
  })).catch(()=>({consoleMessages,requestFailures}));
  evidence.shellState=shellState;
  console.error(JSON.stringify({scenarioFailure:err.message,evidence,mockCalls,pageErrors:failures}));
  throw err;
}finally{
  await browser.close();
}
