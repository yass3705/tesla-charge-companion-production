import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);
const root=path.resolve(process.argv[2]||'dist/v9-global-preview'),runtime=path.join(root,'runtime');
const mod=name=>require(path.join(runtime,'assets/v9',name));
const registry=JSON.parse(fs.readFileSync(path.join(runtime,'data/v9/source-registry.json')));
registry.sources=registry.sources.filter(source=>source.id==='tesla-global');
assert.equal(registry.sources.length,1,'global Tesla source must be in the actual candidate');
const fetchImpl=async url=>{try{return new Response(fs.readFileSync(new URL(url)),{status:200});}catch(error){return new Response(String(error),{status:404});}};
const loaders=mod('browser-loaders.js').createRegistryLoaders({registry,basePath:pathToFileURL(runtime+path.sep).href,
  adapters:{teslaJson:mod('adapters/tesla-json.js')},fetchImpl});
const engine=mod('runtime-engine.js').createEngine({registry,loaders});
const allTesla=JSON.parse(fs.readFileSync(path.join(runtime,'data/tesla_stations.json')));
const currencyCounts={};
for(const raw of allTesla){
  const normalized=mod('adapters/tesla-json.js').normalizeStation(raw);
  for(const [index,config] of (raw.chargingConfigurations?.length?raw.chargingConfigurations:[{pricing:raw.pricing}]).entries()){
    const sourceCurrencies=[...new Set((config.pricing||raw.pricing)?.rules?.map(rule=>rule.currency).filter(Boolean)||[])];
    if(sourceCurrencies.length!==1)continue;
    assert.equal(normalized.offers[index].currency,sourceCurrencies[0],`${raw.id}: Tesla source currency must survive normalization`);
    currencyCounts[sourceCurrencies[0]]=(currencyCounts[sourceCurrencies[0]]||0)+1;
  }
}
for(const currency of ['EUR','GBP','CHF','MAD'])assert.ok(currencyCounts[currency]>0,`${currency} absent from Tesla candidate`);
const area=await engine.queryArea({countryCode:'PT',origin:{lat:41.20845,lon:-8.688498},radiusKm:10,filters:{operatorIds:['tesla']}});
const matches=area.stations.filter(station=>station.id==='tesla-matosinhos-portugal');
assert.equal(matches.length,1,'Matosinhos must be returned from the pinned Tesla source');
assert.ok(matches[0].evses.length>0&&matches[0].offers.length>0);
assert.match(matches[0].teslaUrl||'',/^https:\/\/www\.tesla\.com\//);
assert.match(matches[0].mapsUrl||'',/^https:\/\/maps\.google\.com\//);
assert.deepEqual(area.diagnostics?.errors||[],[]);
console.log(JSON.stringify({ok:true,station:matches[0].id,evses:matches[0].evses.length,offers:matches[0].offers.length,currencyCounts}));
