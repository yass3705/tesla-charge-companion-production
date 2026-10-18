import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const root=process.env.TCC_V9_DIST;if(!root)throw Error('TCC_V9_DIST required');
const config=JSON.parse(fs.readFileSync(new URL('../config/v9-tariff-phase7-midhope-133-scenarios.json',import.meta.url)));
const golden=JSON.parse(fs.readFileSync(new URL('./golden/v9-tariff-phase7-midhope-source-133.json',import.meta.url)));
const source=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,golden.sourcePath))));
const server=http.createServer((req,res)=>{
  const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,'');
  const file=path.resolve(root,relative);
  if(!file.startsWith(path.resolve(root)+path.sep)){res.writeHead(403).end();return;}
  try{const data=fs.readFileSync(file);res.writeHead(200,{'content-type':file.endsWith('.js')?'text/javascript':'application/octet-stream'}).end(data);}
  catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const scripts=['data-engine','offer-engine','pricing-engine','session-engine','vehicle-profile-engine',
  'charge-model-engine','session-planner-engine','station-score-engine','routing-engine',
  'tariff-shadow-adapter','runtime-engine'];
const percentile=(xs,p)=>xs.slice().sort((a,b)=>a-b)[Math.floor((xs.length-1)*p)];
const report={pin:golden.snapshotId,sourceSha256:golden.sourceSha256,profiles:{}};
try{
  for(const [name,options,throttle] of [
    ['desktop',{viewport:{width:1280,height:900}},1],
    ['mobile_emulated_4x_cpu',{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2},4]]){
    const context=await browser.newContext(options),page=await context.newPage();
    await page.goto(base+'/runtime/assets/v9/data-engine.js');
    await page.setContent('<!doctype html><html><body><main id="results">Legacy UI</main></body></html>');
    for(const script of scripts)await page.addScriptTag({url:base+'/runtime/assets/v9/'+script+'.js'});
    await page.addScriptTag({url:base+'/runtime/assets/v9/adapters/uk-open-feeds.js'});
    if(throttle>1){const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:throttle});}
    const data=await page.evaluate(({source,config})=>{
      const adapter=window.TCCV9TariffShadowAdapter,uk=window.TCCV9Adapters.ukOpenFeeds;
      const payload=source.sources[0],raw=payload.locations[0];
      const station=uk.normalizeLocation(raw,payload,new Map(),{sourceId:'uk-connected-kerb-midhope-guest-verified'});
      station.id=station.canonicalId;
      const flag={enabled:true,mode:'shadow',pin:adapter.PIN,country:'GB',cpo:'Connected Kerb',channel:'Connected Kerb',
        stationId:adapter.STATION,exactTuples:adapter.tuples.map(({evseId,connectorId,offerId})=>({evseId,connectorId,offerId}))};
      const off=window.TCCV9RuntimeEngine.createEngine({registry:{sources:[]}});
      const on=window.TCCV9RuntimeEngine.createEngine({registry:{sources:[]},tariffShadowFlag:flag});
      const element=document.getElementById('results'),html=element.innerHTML;
      const offDurations=[],onDurations=[],legacyTotals=[],candidateTotals=[];
      for(const spec of config.scenarios)for(const evse of station.evses){
        const connector=evse.connectors[0],offer=station.offers.find(o=>o.connectorIds?.[0]===connector.id);
        if(!offer)throw Error('missing exact offer');
        const variant={...station,evses:[{...evse,connectors:[connector]}],offers:[offer]};
        const session={...config.session,...spec.session,durationMinutes:spec.session.chargingMinutes};
        let started=performance.now();const before=off.evaluateStation(variant,session,{targetCurrency:'GBP'});
        offDurations.push(performance.now()-started);
        started=performance.now();const after=on.evaluateStation(variant,session,{targetCurrency:'GBP'});
        onDurations.push(performance.now()-started);
        if(JSON.stringify(before)!==JSON.stringify(after))throw Error('legacy result mutation');
        legacyTotals.push(before.best?.total??null);candidateTotals.push(after.best?.total??null);
      }
      if(element.innerHTML!==html)throw Error('UI mutation');
      if(JSON.stringify(legacyTotals)!==JSON.stringify(candidateTotals))throw Error('ranking input mutation');
      const metrics=on.tariffShadowMetrics(),candidateMs=on.tariffShadowTimings();
      const diagnostics=on.tariffShadowDiagnostics();
      const beforeRollback=metrics.evaluations;on.rollbackTariffShadow();
      const evse=station.evses[0],connector=evse.connectors[0],offer=station.offers.find(o=>o.connectorIds?.[0]===connector.id);
      on.evaluateStation({...station,evses:[{...evse,connectors:[connector]}],offers:[offer]},
        {...config.session,...config.scenarios[0].session,durationMinutes:config.scenarios[0].session.chargingMinutes},{targetCurrency:'GBP'});
      return{metrics,disabledMetrics:off.tariffShadowMetrics(),candidateMs,offDurations,onDurations,
        diagnosticCount:diagnostics.length,diagnosticSample:diagnostics[0],rollbackCallsAfter:on.tariffShadowMetrics().evaluations-beforeRollback,
        diagnosticsAfterRollback:on.tariffShadowDiagnostics().length,domPreserved:element.innerHTML===html,
        rankInputsPreserved:JSON.stringify(legacyTotals)===JSON.stringify(candidateTotals)};
    },{source,config});
    assert.equal(data.metrics.evaluations,64);assert.equal(data.metrics.errors,0);
    assert.equal(data.disabledMetrics.evaluations,0);assert.equal(data.rollbackCallsAfter,0);
    assert.equal(data.diagnosticsAfterRollback,0);assert.equal(data.domPreserved,true);assert.equal(data.rankInputsPreserved,true);
    assert.equal(JSON.stringify(data.diagnosticSample).includes('a46c9e98'),false);
    report.profiles[name]={viewport:options.viewport,cpuThrottle:throttle,evaluations:64,
      candidateP50Ms:percentile(data.candidateMs,.5),candidateP95Ms:percentile(data.candidateMs,.95),
      wholeEvaluationOffP95Ms:percentile(data.offDurations,.95),wholeEvaluationShadowP95Ms:percentile(data.onDurations,.95),
      divergences:data.metrics,diagnosticCount:data.diagnosticCount,rollbackCallsAfter:0,domPreserved:true,rankInputsPreserved:true};
    await context.close();
  }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
if(process.env.TCC_V9_BROWSER_REPORT)fs.writeFileSync(process.env.TCC_V9_BROWSER_REPORT,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
