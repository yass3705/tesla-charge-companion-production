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
  await page.locator('#simNow').fill('25');
  await page.locator('#simTarget').fill('80');
  await page.locator('#simMaxDistance').fill('10');
  await page.locator('#simOperatorFilter').selectOption('all');
  const inputs=await page.evaluate(()=>window.TCCV9ProductionShell.readInputs(window));
  assert.equal(inputs.startSoc,25);
  assert.equal(inputs.targetSoc,80);
  assert.equal(inputs.radiusKm,10);
  assert.equal(inputs.operatorMode,'all');
  // Simulate the actual selector and change event without contacting external
  // geocoding/routing services: compare is temporarily stubbed only for UI test.
  const selector=await page.evaluate(()=>{
    const original=window.compare;
    let calls=0;
    window.compare=()=>{calls++;};
    try{
      window.TCCV9ProductionShell.renderSubscriptionSelector(window,[
        {id:'preview-subscription',provider:'Test verified subscription',countries:['FR']}
      ],'FR');
      const input=document.querySelector('#v9SubscriptionChoices input[data-v9-subscription-id="preview-subscription"]');
      if(!input)throw new Error('Subscription UI missing');
      input.click();
      const selected=window.TCCV9ProductionShell.selectedSubscriptions(window);
      const result={selected,checked:input.checked,calls};
      input.click(); // return to clean default state
      return result;
    }finally{window.compare=original;}
  });
  assert.ok(selector.selected.includes('preview-subscription')&&selector.checked&&selector.calls===1,selector);
  assert.deepEqual(severe,[]);
  console.log(JSON.stringify({ok:true,realBrowser:true,shell,interactiveTabs:true,changedInputs:inputs,subscriptionEventVerified:true,pageErrors:severe,noncriticalHttp}));
}finally{
  await browser.close();
}
