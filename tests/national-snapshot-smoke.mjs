import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require=createRequire(import.meta.url);
const root=path.resolve(process.argv[2]||'dist/v9-explicit-candidate');
const runtime=path.join(root,'runtime');
const browserLoaders=require(path.join(runtime,'assets/v9/browser-loaders.js'));
const extension=require(path.join(runtime,'assets/v9/production-loader-extension.js'));
const netherlandsDotnl=require(path.join(runtime,'assets/v9/adapters/netherlands-dotnl.js'));
const belgiumNap=require(path.join(runtime,'assets/v9/adapters/belgium-nap.js'));

function fileFetch(baseRoot){
  return async function(url){
    const u=String(url);
    const file=u.startsWith('file://')?new URL(u):path.resolve(baseRoot,u);
    try{return new Response(fs.readFileSync(file),{status:200});}
    catch(err){return new Response(String(err),{status:404});}
  };
}

const registry=JSON.parse(fs.readFileSync(path.join(runtime,'data/v9/source-registry.json'),'utf8'));
const ids=new Set(['netherlands-dotnl-national','belgium-nap-national']);
const sources=(registry.sources||[]).filter(s=>ids.has(s.id));
assert.equal(sources.length,2,'NL and BE national sources must both be registered');
const selected={...registry,sources};
const adapters={netherlandsDotnl,belgiumNap};
extension.install({baseLoaders:browserLoaders,adapters});
const loaders=browserLoaders.createRegistryLoaders({
  registry:selected,
  basePath:pathToFileURL(runtime+path.sep).href,
  adapters,
  fetchImpl:fileFetch(runtime)
});
assert.equal(typeof loaders['netherlands-dotnl-national'],'function');
assert.equal(typeof loaders['belgium-nap-national'],'function');

const nl=await loaders['netherlands-dotnl-national']({origin:{lat:52.3676,lon:4.9041},radiusKm:20});
assert.ok(nl.length>0,'NL DOT-NL returned no stations near Amsterdam');
assert.ok(nl.every(s=>s.countryCode==='NL'&&!/tesla/i.test(s.physicalOperator?.name||'')),'NL contains wrong-country or Tesla rows');
assert.ok(nl.some(s=>(s.offers||[]).length>0),'NL smoke area has no direct priced station');

const be=await loaders['belgium-nap-national']({origin:{lat:51.2194,lon:4.4025},radiusKm:20});
assert.ok(be.length>0,'BE NAP returned no stations near Antwerp');
assert.ok(be.every(s=>s.countryCode==='BE'),'BE contains a wrong-country row');
assert.ok(be.some(s=>(s.evses||[]).length>0),'BE smoke area has no EVSEs');
assert.ok(be.some(s=>(s.offers||[]).length>0),'BE smoke area has no directly priced station');

console.log(JSON.stringify({
  ok:true,
  NL:{stations:nl.length,pricedStations:nl.filter(s=>(s.offers||[]).length>0).length},
  BE:{stations:be.length,pricedStations:be.filter(s=>(s.offers||[]).length>0).length}
}));
