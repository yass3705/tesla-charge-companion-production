import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base=process.env.TCC_PREVIEW_URL||'http://127.0.0.1:8765';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const page=await browser.newPage({serviceWorkers:'block'});
const severe=[];
const noncriticalHttp=[];
page.on('pageerror',e=>severe.push('pageerror: '+e.message));
page.on('console',m=>{if(m.type()==='error'&&/TCC V9 shell|uncaught|install failed/i.test(m.text()))severe.push('console: '+m.text())});
page.on('response',response=>{if(response.status()<400)return;const url=response.url();if(/\/(?:assets\/v9\/|data\/v9\/|v9-production-shell\/bridge\.js|v9-production-shell\/shell-config\.json)/.test(url))severe.push('essential HTTP '+response.status()+': '+url);else noncriticalHttp.push({status:response.status(),url});});
try{
  await page.goto(base+'/v9-production-shell/',{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForFunction(()=>Boolean(window.__TCC_V9_SHELL__&&window.TCCV9ProductionBootstrap&&window.TCCV9ProductionLoaders),{timeout:45000});
  const shell=await page.evaluate(()=>({
    mode:window.__TCC_V9_SHELL__.mode,
    scopes:window.__TCC_V9_SHELL__.engineScopeCountries,
    bridgeInstalled:typeof window.compare==='function',
    registryLoader:typeof window.TCCV9BrowserLoaders.createRegistryLoaders==='function',
    candidateSha:window.__TCC_V9_SHELL__.candidateSha,
    scriptCount:[...document.scripts].filter(s=>s.src.includes('/assets/v9/')).length,
    base:document.baseURI
  }));
  assert.equal(shell.mode,'candidate');
  assert.ok(shell.bridgeInstalled&&shell.registryLoader);
  assert.ok(shell.scopes.includes('DE')&&shell.scopes.includes('GB')&&shell.scopes.includes('MA'));
  assert.ok(shell.scriptCount>=30,shell);
  await page.locator('nav button[data-tab="stations"]').click();
  await page.waitForFunction(()=>document.getElementById('stations')?.classList.contains('active'));
  await page.locator('nav button[data-tab="compare"]').click();
  await page.waitForFunction(()=>document.getElementById('compare')?.classList.contains('active'));
  const openFilterGroupFor=async id=>{
    const group=page.locator('details.v9-filter-group').filter({has:page.locator('#'+id)});
    if(await group.locator('summary').count())await group.locator('summary').click();
  };
  await openFilterGroupFor('simNow');
  await openFilterGroupFor('simOperatorFilter');
  await openFilterGroupFor('simPowerType');
  await openFilterGroupFor('simMaxDistance');
  await page.locator('#simNow').fill('25');
  await page.locator('#simTarget').fill('80');
  await page.locator('#simMaxDistance').fill('10');
  await page.locator('#simOperatorFilter').selectOption(['all']);
  await page.locator('#simPowerType').selectOption(['AC']);
  const inputs=await page.evaluate(()=>window.TCCV9ProductionShell.readInputs(window));
  assert.equal(inputs.startSoc,25);
  assert.equal(inputs.targetSoc,80);
  assert.equal(inputs.radiusKm,10);
  assert.equal(inputs.operatorMode,'all');
  assert.deepEqual(inputs.connectorKinds,['AC']);
  assert.equal(await page.locator('#v9UseCurrentPosition').count(),1);
  const uiContracts=await page.evaluate(()=>{
    const shell=window.TCCV9ProductionShell;
    const original=window.compare;
    let calls=0;
    window.compare=()=>{calls++;};
    try{
      shell.renderSubscriptionSelector(window,[
        {id:'preview-subscription',provider:'Test verified subscription',countries:['FR']}
      ],'FR');
      const select=document.querySelector('#v9SubscriptionChoices');
      if(!select)throw new Error('Subscription UI missing');
      select.options[0].selected=true;
      select.dispatchEvent(new Event('change',{bubbles:true}));
      const selected=shell.selectedSubscriptions(window);
      const powerRows=shell.powerLines({station:{evses:[{id:'a',connectors:[{powerKw:11,kind:'AC'},{powerKw:150,kind:'DC'},{powerKw:150,kind:'DC'}]}]}});
      const summary=document.createElement('section');summary.id='results';document.body.appendChild(summary);
      window.TCCV9MapPriceEngine={summarizeZones:()=>[],formatPricePerKm:()=>'-'};
      shell.renderMapSummary(window,{},{});
      return{selected,calls,powerRows,hasViewButtons:!!document.querySelector('.v9-view-map')};
    }finally{window.compare=original;}
  });
  assert.ok(uiContracts.selected.includes('preview-subscription')&&uiContracts.calls===1,uiContracts);
  assert.deepEqual(uiContracts.powerRows.map(row=>[row.kind,row.powerKw,row.count]),[['AC',11,1],['DC',150,2]]);
  assert.ok(uiContracts.hasViewButtons);
  assert.equal(await page.evaluate(()=>window.TCCV9ProductionShell.combineDateTime('2026-10-03','24:00')), '2026-10-04T00:00:00.000Z');
  assert.deepEqual(severe,[]);
  console.log(JSON.stringify({ok:true,realBrowser:true,shell,interactiveTabs:true,changedInputs:inputs,subscriptionEventVerified:true,pageErrors:severe,noncriticalHttp}));
}finally{
  await browser.close();
}
