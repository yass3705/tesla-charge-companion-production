import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash,webcrypto} from 'node:crypto';
const require=createRequire(import.meta.url);
const {loadPrepared}=require('../runtime-owned/assets/v9/preproduction-candidate-loader.js');
const {toFragments}=require('../runtime-owned/assets/v9/adapters/canonical-v9.js');
const sha=v=>createHash('sha256').update(v).digest('hex'),files=new Map(),sources=[];
for(const source of ['FR:fixture_a','FR:fixture_b']){
 const shards=[];
 for(let i=0;i<7;i++){
  const id=source+'-'+i,payload={schemaVersion:1,source:{id:source,artifactSha256:'a'.repeat(64)},cpos:[{id:'cpo',name:'Fixture'}],
   stations:[{id,country:'FR',cpoId:'cpo',latitude:48,longitude:2}],evses:[],connectors:[],offers:[]};
  const raw=JSON.stringify(payload),path=`shards/${source.replace(':','__')}__${String(i).padStart(4,'0')}.json`;
  files.set('/preview/'+path,raw);shards.push({path,sha256:sha(raw),bytes:Buffer.byteLength(raw),stationCount:1,bbox:[48,2,48,2]});
 }
 sources.push({source,sourceSha256:'b'.repeat(64),sourceArtifactSha256:'a'.repeat(64),shards});
}
files.set('/preview/index.json',JSON.stringify({schemaVersion:2,bundleId:'fixture',status:'prepared',sources,rejected:[]}));
let active=0,maximum=0,loads=0;
const prepared=await loadPrepared({baseUrl:'https://test.invalid/preview',adapter:{toFragments},cryptoImpl:webcrypto,fetchImpl:async url=>{
 const path=new URL(url).pathname,body=files.get(path);if(!body)return new Response('',{status:404});
 if(!path.endsWith('index.json')){loads++;active++;maximum=Math.max(maximum,active);await new Promise(r=>setTimeout(r,10));active--;}
 return new Response(body);
}});
const rows=await Promise.all(Object.values(prepared.loaders).map(load=>load({origin:{lat:48,lon:2},radiusKm:100})));
assert.equal(rows.flat().length,14,'bounded loading must not truncate stations');
assert.equal(maximum,4,'all sources share the same four-request budget');
await Promise.all(Object.values(prepared.loaders).map(load=>load({origin:{lat:48,lon:2},radiusKm:100})));
assert.equal(loads,14,'cached shards must be reused');
console.log('Prepared candidate shared loading budget and complete inventory PASS');
