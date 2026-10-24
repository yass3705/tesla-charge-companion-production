import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {loadPrepared}=require('../runtime-owned/assets/v9/preproduction-candidate-loader.js');
const {toFragments}=require('../runtime-owned/assets/v9/adapters/canonical-v9.js');

const sourceId='GB:ionity_direct',artifact='a'.repeat(64);
function payload(suffix,lat,lon,price){
  const cpo='cpo',station='station-'+suffix,evse='evse-'+suffix,plug='plug-'+suffix;
  return {schemaVersion:1,source:{id:sourceId,artifactSha256:artifact},countries:[{code:'GB'}],
    cpos:[{id:cpo,name:'IONITY',sourceOperatorId:'IONITY_CPO'}],
    stations:[{id:station,cpoId:cpo,country:'GB',sourceStationId:suffix,name:suffix,
      latitude:lat,longitude:lon}],
    evses:[{id:evse,stationId:station,cpoId:cpo,country:'GB',sourceEvseId:suffix,officialEvseId:null}],
    connectors:[{id:plug,evseId:evse,powerKw:150,rawSourceFields:{kind:'DC'}}],
    offers:[{id:'offer-'+suffix,channel:'Direct',scope:{evseId:evse,connectorId:plug},
      rawOffer:{pricePerKwhEur:price},calculationStatus:'not_evaluated'}]};
}
const items=[payload('paris',48.856,2.352,.7),payload('lyon',45.764,4.835,.8)];
const bytes=items.map(item=>new TextEncoder().encode(JSON.stringify(item)));
const hash=raw=>createHash('sha256').update(raw).digest('hex');
const shards=bytes.map((raw,index)=>({path:`shards/GB__ionity_direct__${String(index).padStart(4,'0')}.json`,
  sha256:hash(raw),bytes:raw.length,stationCount:1,
  bbox:[items[index].stations[0].latitude,items[index].stations[0].longitude,
    items[index].stations[0].latitude,items[index].stations[0].longitude]}));
const index={schemaVersion:2,status:'prepared',bundleId:'b'.repeat(64),rejected:[],joins:[],
  sources:[{source:sourceId,sourceSha256:'c'.repeat(64),sourceArtifactSha256:artifact,shards}]};
const indexSha=hash(new TextEncoder().encode(JSON.stringify(index)));
const seen=[];
function fetcher(bad=false){return async url=>{
  if(url.endsWith('index.json'))return {ok:true,arrayBuffer:async()=>new TextEncoder().encode(JSON.stringify(index)).buffer};
  const position=shards.findIndex(shard=>url.endsWith(shard.path));
  assert.ok(position>=0);seen.push(position);
  const raw=bad&&position===0?new TextEncoder().encode('{}'):bytes[position];
  return {ok:true,arrayBuffer:async()=>raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength)};
};}
const prepared=await loadPrepared({baseUrl:'http://127.0.0.1/prepared-v9/',origin:'http://127.0.0.1/',
  fetchImpl:fetcher(),cryptoImpl:webcrypto,adapter:{toFragments},expectedIndexSha256:indexSha});
const load=prepared.loaders['prepared:'+sourceId];
const paris=await load({origin:{lat:48.856,lon:2.352},radiusKm:10});
assert.equal(paris.length,1);
assert.equal(paris[0].name,'paris');
assert.deepEqual(seen,[0],'distant shard is not downloaded for a Paris query');
const lyon=await load({origin:{lat:45.764,lon:4.835},radiusKm:10});
assert.equal(lyon.length,1);
assert.equal(lyon[0].name,'lyon');
assert.deepEqual(seen,[0,1]);
assert.equal((await load({})).length,2,'unbounded query retains all stations');
const corrupted=await loadPrepared({baseUrl:'http://127.0.0.1/prepared-v9/',origin:'http://127.0.0.1/',
  fetchImpl:fetcher(true),cryptoImpl:webcrypto,adapter:{toFragments}});
await assert.rejects(corrupted.loaders['prepared:'+sourceId]({origin:{lat:48.856,lon:2.352},radiusKm:10}),
  /candidate source SHA mismatch/);
await assert.rejects(loadPrepared({baseUrl:'http://127.0.0.1/prepared-v9/',origin:'http://127.0.0.1/',
  fetchImpl:fetcher(),cryptoImpl:webcrypto,adapter:{toFragments},expectedIndexSha256:'d'.repeat(64)}),
  /candidate source SHA mismatch/,'an altered index cannot point to new shard hashes');
console.log('V9 sharded candidate: spatial fetch, complete fallback and SHA failure pass');
