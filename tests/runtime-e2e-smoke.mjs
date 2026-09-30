import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require=createRequire(import.meta.url);
const root=path.resolve(process.argv[2]||'dist/v9-2026-09-30-r8');
const runtime=path.join(root,'runtime');

const dataEngine=require(path.join(runtime,'assets/v9/data-engine.js'));
const browserLoaders=require(path.join(runtime,'assets/v9/browser-loaders.js'));
const de=require(path.join(runtime,'assets/v9/adapters/germany-national.js'));
const uk=require(path.join(runtime,'assets/v9/adapters/uk-open-feeds.js'));
const extension=require(path.join(runtime,'assets/v9/production-loader-extension.js'));

function fileFetch(baseRoot){
  return async function(url){
    const u=String(url);
    let file;
    if(u.startsWith('file://')) file=new URL(u);
    else file=path.resolve(baseRoot,u);
    try{
      const bytes=fs.readFileSync(file);
      return new Response(bytes,{status:200});
    }catch(err){
      return new Response(String(err),{status:404});
    }
  };
}

const registry=JSON.parse(fs.readFileSync(path.join(runtime,'data/v9/source-registry.json'),'utf8'));
const wanted=new Set(['germany-production-snapshot','uk-production-open-feeds']);
const subRegistry={...registry,sources:(registry.sources||[]).filter(s=>wanted.has(s.id))};

extension.install({
  baseLoaders:browserLoaders,
  adapters:{germanyNational:de,ukOpenFeeds:uk}
});

const loaders=browserLoaders.createRegistryLoaders({
  registry:subRegistry,
  basePath:pathToFileURL(runtime+path.sep).href,
  adapters:{germanyNational:de,ukOpenFeeds:uk},
  fetchImpl:fileFetch(runtime)
});

assert.equal(typeof loaders['germany-production-snapshot'],'function');
assert.equal(typeof loaders['uk-production-open-feeds'],'function');

const engine=dataEngine.createEngine({registry:subRegistry,loaders});

const deResult=await engine.queryArea({countryCode:'DE',routingBudget:20});
assert.ok(deResult.stations.length>63000,'DE station count too low: '+deResult.stations.length);
const dePriced=deResult.stations.filter(s=>(s.offers||[]).length>0);
const ionityPriced=deResult.stations.filter(s=>(s.offers||[]).some(o=>o.provider==='IONITY Direct'));
assert.ok(ionityPriced.length>=120,'IONITY DE safe priced station count too low: '+ionityPriced.length);
assert.ok(deResult.diagnostics.sources['germany-production-snapshot']?.loaded===true);

const gbResult=await engine.queryArea({countryCode:'GB',routingBudget:20});
assert.ok(gbResult.stations.length>0,'GB returned no stations');
const gbPriced=gbResult.stations.filter(s=>(s.offers||[]).length>0);
assert.ok(gbPriced.length>0,'GB returned no priced stations from exact tariff joins');
assert.ok(gbResult.diagnostics.sources['uk-production-open-feeds']?.loaded===true);

const exactMfg=gbResult.stations.find(s=>(s.evses||[]).some(e=>e.id==='GB*MFL*E5550'));
assert.ok(exactMfg,'Expected MFG EVSE GB*MFL*E5550 missing from GB runtime query');
const energyOffers=(exactMfg.offers||[]).flatMap(o=>(o.pricing?.rules||[]).map(r=>({provider:o.provider,price:r.pricePerKwh,currency:r.currency})));
assert.ok(energyOffers.some(x=>x.currency==='GBP'&&Math.abs(Number(x.price)-0.6583)<1e-9),'Expected exact MFG GBP 0.6583/kWh tariff missing');

console.log(JSON.stringify({
  ok:true,
  DE:{stations:deResult.stations.length,pricedStations:dePriced.length,ionityDirectSafeStations:ionityPriced.length},
  GB:{stations:gbResult.stations.length,pricedStations:gbPriced.length,mfgExactTariffVerified:true}
}));
