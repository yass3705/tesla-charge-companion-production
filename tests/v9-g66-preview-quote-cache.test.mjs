import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const context={URL,TextDecoder};
runInNewContext(readFileSync(new URL('../runtime-owned/assets/v9/g66-preview.js',import.meta.url),'utf8'),context);
const descriptor={bundleId:'fixture-bundle',nationalCanonicalSha256:'national',gateCodeSha:'gate'};
const calls=[];
let failNext=false;
class Worker {
  terminate(){}
  postMessage(data){
    calls.push(structuredClone(data.requests));
    queueMicrotask(()=>{
      if(failNext){failNext=false;this.onmessage({data:{id:data.id,error:'fixture failure'}});return;}
      const answers=data.requests.map(request=>({
        estimateEur:request.session.energy,
        scope:{nationalConnectorKey:request.nationalConnectorKey},
        session:request.session
      }));
      this.onmessage({data:{id:data.id,answers}});
    });
  }
}
context.Worker=Worker;
const w={
  document:{baseURI:'https://preview.invalid/'},
  location:{origin:'https://preview.invalid'},
  fetch:async()=>new Response(JSON.stringify(descriptor)),
  TCCV9PreparedCandidate:{sha256Hex:async()=> 'fixture-sha'},
  console:{error(){}}
};
const transport=await context.TCCV9G66Preview.create(w,{
  mode:'candidate',preproductionIsolated:true,g66DescriptorSha256:'fixture-sha',preparedBundleId:descriptor.bundleId
});
const request=(id,energy)=>({nationalConnectorKey:id,tariff_signature:'tariff',session:{energy}});
const evaluate=(rows)=>transport.evaluate(quote=>rows.map(row=>quote(row)));
const first=request('connector-1','10');
transport.warm();
transport.warm();
const original=await evaluate([first]);
assert.equal(calls[0].length,0,'warm-up makes no pricing requests');
assert.equal(original[0].estimateEur,'10');
assert.equal((await evaluate([first]))[0].estimateEur,'10');
assert.equal(calls.length,2,'exact repeated session is served by the generation cache');
for(const changed of [request('connector-2','10'),request('connector-1','11'),{...first,tariff_signature:'different'}]){
  const before=calls.length;
  const [answer]=await evaluate([changed]);
  assert.equal(calls.length,before+1,'a changed connector, session or tariff must request another quote');
  assert.equal(answer.estimateEur,changed.session.energy);
}
const retry=request('connector-unavailable','42');
failNext=true;
assert.equal((await evaluate([retry]))[0],null);
assert.equal((await evaluate([retry]))[0].estimateEur,'42','transport failures are never cached');

const more=Array.from({length:2050},(_,index)=>request('new-'+index,'21'));
const all=await evaluate([first,...more]);
assert.equal(all.length,2051);
assert.equal(all[0].estimateEur,'10','eviction cannot discard an answer needed by the in-flight pass');
assert.ok(all.slice(1).every(answer=>answer.estimateEur==='21'));
const second=await context.TCCV9G66Preview.create(w,{
  mode:'candidate',preproductionIsolated:true,g66DescriptorSha256:'fixture-sha',preparedBundleId:descriptor.bundleId
});
failNext=true;
second.warm();
const recovered=await second.evaluate(quote=>quote(first));
assert.equal(recovered.estimateEur,'10','a failed warm-up can be retried by the first real quote');
context.Worker=class {constructor(){throw new Error('Worker API unavailable');}};
const unavailable=await context.TCCV9G66Preview.create(w,{
  mode:'candidate',preproductionIsolated:true,g66DescriptorSha256:'fixture-sha',preparedBundleId:descriptor.bundleId
});
unavailable.warm();
assert.equal(await unavailable.evaluate(quote=>quote(first)),null,'unavailable worker fails closed');
console.log('Electroverse preview exact quote cache, retry and bound preservation PASS');
