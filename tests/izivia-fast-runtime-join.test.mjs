import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);
const root=path.resolve(process.argv[2]||'dist/v9-izivia-fast-candidate');
const runtime=path.join(root,'runtime');
const engineModule=require(path.join(runtime,'assets/v9/data-engine.js'));
const loadersModule=require(path.join(runtime,'assets/v9/browser-loaders.js'));
const nationalCompact=require(path.join(runtime,'assets/v9/adapters/national-compact.js'));
const directOffers=require(path.join(runtime,'assets/v9/adapters/direct-offers.js'));
const extension=require(path.join(runtime,'assets/v9/production-loader-extension.js'));
const registry=JSON.parse(fs.readFileSync(path.join(runtime,'data/v9/source-registry.json'),'utf8'));
const wanted=new Set(['france-national','france-izivia-fast-direct-exact','france-izivia-fast-connector-correction']);
const subRegistry={...registry,sources:registry.sources.filter(x=>wanted.has(x.id))};
assert.equal(subRegistry.sources.length,3);
extension.install({baseLoaders:loadersModule,adapters:{nationalCompact,directOffers}});
const fetchImpl=async url=>{
 const filename=String(url).startsWith('file://')?new URL(String(url)):path.resolve(runtime,String(url));
 try{return new Response(fs.readFileSync(filename),{status:200});}
 catch(err){return new Response(String(err),{status:404});}
};
const loaders=loadersModule.createRegistryLoaders({
 registry:subRegistry,basePath:pathToFileURL(runtime+path.sep).href,
 adapters:{nationalCompact,directOffers},fetchImpl
});
assert.equal(typeof loaders['france-izivia-fast-direct-exact'],'function');
const x=await loaders['france-izivia-fast-direct-exact']();
assert.equal(x.offerRules.length,6);
const engine=engineModule.createEngine({registry:subRegistry,loaders});
const result=await engine.queryArea({countryCode:'FR',origin:{lat:48.83456,lon:2.56171},radiusKm:3,routingBudget:20});
assert.equal(result.diagnostics.sources['france-izivia-fast-direct-exact']?.loaded,true);
assert.equal(result.diagnostics.sources['france-izivia-fast-connector-correction']?.loaded,true);
const directMatches=result.stations.filter(s=>(s.offers||[]).some(o=>String(o.provider).startsWith('IZIVIA FAST direct')));
console.log(JSON.stringify({stations:result.stations.length,iziviaMatches:directMatches.length,sample:directMatches.slice(0,3).map(s=>({id:s.id,operator:s.physicalOperator,offers:s.offers.filter(o=>o.provider?.startsWith('IZIVIA FAST direct')).map(o=>o.id)})),nearbyCandidates:result.stations.filter(s=>/izivia|mcdonald|fast|noisy/i.test([s.name,s.networkBrand,s.physicalOperator?.name].join(' '))).slice(0,8).map(s=>({id:s.id,name:s.name,operator:s.physicalOperator,brand:s.networkBrand,aliases:s.aliases?.slice(0,8),provenance:s.provenance?.slice(0,5),evses:s.evses?.slice(0,3).map(e=>({id:e.id,powers:e.connectors?.map(c=>c.powerKw)}))}))}));
assert.ok(directMatches.length>0,'Validated FAST offer did not attach to any canonical IRVE station near Noisy-le-Grand');
for(const s of directMatches)assert.ok((s.offers||[]).filter(o=>o.provider?.startsWith('IZIVIA FAST direct')).every(o=>o.kind==='direct'));
