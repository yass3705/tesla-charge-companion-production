import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const ui=require('../v9-production-shell/bridge.js');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
await mkdir('artifacts',{recursive:true});
try {
 for(const [label,width,height] of [['desktop',1280,900],['mobile',390,844]]) {
  const page=await browser.newPage({viewport:{width,height}});
  await page.setContent(`<!doctype html><html lang="fr"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#101820;color:white;font:16px system-ui">
    <main><section class="panel active" id="compare" style="max-width:700px;margin:auto;padding:16px"><h1>Simulation</h1>
    <details class="v9-filter-group"><summary>Paramètres de recherche</summary><div class="grid"><input id="simOrigin" value="Paris"></div></details>
    <div style="height:1400px">Résultats</div></section></main></body></html>`);
  await page.evaluate(()=>{window.scrollTo(0,700)});
  // Expose only stable, audited frontend functions to the browser.
  const css=await page.evaluate(()=>null);
  await page.addScriptTag({content:`window.__dummy = true;`});
  // Inject the exact navigation markup/styles used by installFloatingNavigation.
  const source=ui.installFloatingNavigation.toString();
  await page.evaluate(source=>{(0,eval)('('+source+')(window)');},source);
  // Navigation is installed from source; focus/scroll behavior uses real browser APIs.
  await page.locator('#v9JumpFilters').click();
  await page.waitForTimeout(250);
  assert.equal(await page.locator('.v9-filter-group').evaluate(e=>e.open),true,label);
  assert.equal(await page.locator('#v9JumpFilters').count(),1,label);
  await page.locator('#v9JumpTop').click();
  await page.waitForTimeout(500);
  assert.ok(await page.evaluate(()=>scrollY)<100,label+' top navigation');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,label+' no overflow');
  await page.screenshot({path:`artifacts/lot2-${label}.png`,fullPage:false});
  await page.close();
 }
} finally {await browser.close();}
console.log('V9 Lot 2 browser navigation OK');
