import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const extension=require('../runtime-overrides/assets/v9/production-loader-extension.js');

// Multiple viewport queries must reuse the immutable UK source but filter each
// query independently. The registry loader's default basePath is '..'.
{
  const urls=[],ukPayload={sources:[{name:'Test Feed',locations:[
    {id:'L1',coordinates:{latitude:51.5,longitude:-0.1}},
    {id:'L2',coordinates:{latitude:52.4,longitude:4.9}}
  ]}]};
  const browserLoaders={createRegistryLoaders:()=>({})};
  extension.install({baseLoaders:browserLoaders,adapters:{ukOpenFeeds:{
    normalizePayload:p=>p.sources.flatMap(s=>s.locations).map(l=>l.id)
  }}});
  const registry={sources:[{id:'uk-production-open-feeds',adapter:'uk-open-feeds-v1',path:'data/uk.json',active:true}]};
  const fetchImpl=async url=>{urls.push(url);return new Response(JSON.stringify(ukPayload),{status:200});};
  const loaders=browserLoaders.createRegistryLoaders({registry,fetchImpl});
  const london=await loaders['uk-production-open-feeds']({origin:{lat:51.5,lon:-0.1},radiusKm:10});
  const amsterdam=await loaders['uk-production-open-feeds']({origin:{lat:52.4,lon:4.9},radiusKm:10});
  assert.deepEqual(london,['L1']);
  assert.deepEqual(amsterdam,['L2']);
  assert.deepEqual(urls,['../data/uk.json']);
}

// A transient source failure must not poison the cache.
{
  let calls=0;
  const browserLoaders={createRegistryLoaders:()=>({})};
  extension.install({baseLoaders:browserLoaders,adapters:{ukOpenFeeds:{normalizePayload:()=>[]}}});
  const loaders=browserLoaders.createRegistryLoaders({
    registry:{sources:[{id:'uk',adapter:'uk-open-feeds-v1',path:'data/uk.json',active:true}]},
    fetchImpl:async()=>{calls++;return calls===1?new Response('offline',{status:503}):new Response(JSON.stringify({sources:[]}),{status:200});}
  });
  await assert.rejects(loaders.uk({countryCode:'GB'}),/503/);
  assert.deepEqual(await loaders.uk({countryCode:'GB'}),[]);
  assert.equal(calls,2);
}

console.log(JSON.stringify({ok:true,cache:'UK immutable source reused across viewports; failure retry verified',defaultBasePath:'..'}));
