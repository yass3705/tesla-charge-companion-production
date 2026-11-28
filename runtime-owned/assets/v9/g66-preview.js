(function(root){
  'use strict';
  const scope=['nationalStationKey','nationalEvseKey','nationalConnectorKey','source_id','tariff_signature'];
  async function create(w,config) {
    const base=new URL('g66-preview/',w.document.baseURI);
    if(base.origin!==w.location.origin||config.mode!=='candidate'||!config.preproductionIsolated)
      throw Error('Contexte de recette Electroverse invalide');
    async function bytes(name,sha){
      const response=await w.fetch(new URL(name,base));
      if(!response.ok)throw Error('Données Electroverse indisponibles');
      const raw=await response.arrayBuffer();
      if(await w.TCCV9PreparedCandidate.sha256Hex(raw,w.crypto)!==sha)throw Error('Empreinte Electroverse invalide');
      return raw;
    }
    const d=JSON.parse(new TextDecoder().decode(await bytes('descriptor.json',config.g66DescriptorSha256)));
    if(d.bundleId!==config.preparedBundleId)throw Error('Génération Electroverse incompatible');
    let bindingPromise,worker,sequence=0;
    const pending=new Map();
    async function attach(fragments,entry){
      if(entry.sourceSha256!==d.nationalCanonicalSha256)throw Error('Catalogue IRVE incompatible');
      bindingPromise??=(async()=>{
        const raw=await bytes('bindings.bin',d.files['bindings.bin']);
        const table=new Map();
        for(const row of await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'))).json()){
          if(table.has(row.nationalConnectorKey))throw Error('Prise Electroverse ambiguë');
          table.set(row.nationalConnectorKey,row);
        }
        return table;
      })();
      const bindings=await bindingPromise;
      for(const st of fragments)for(const ev of st.evses)for(const c of ev.connectors){
        const r=bindings.get(c.id);if(!r)continue;
        if(st.countryCode!=='FR'||r.nationalStationKey!==st.canonicalId||r.nationalEvseKey!==ev.id||
            ev.officialEvseId!==r.evse_id||Number(r.national_kw)!==c.powerKw||r.national_mode!==c.kind)
          throw Error('Portée Electroverse incohérente');
        st.offers.push({id:'g66-'+r.national_id,provider:'Electroverse',kind:'roaming',currency:'EUR',countries:['FR'],
          evseIds:[ev.id],connectorIds:[c.id],connectorKinds:[c.kind],pricing:{type:'rules',rules:[]},
          metadata:{g66Dynamic:true,source:'Electroverse · correspondance IRVE vérifiée',sourceId:'FR:electroverse_overlay',timeZone:'Europe/Paris',...Object.fromEntries(scope.map(k=>[k,r[k]]))}});
      }
      return fragments;
    }
    async function quoteBatch(requests){
      if(!worker){
        worker=new Worker(new URL('worker.js',base));
        worker.onmessage=({data})=>{
          const task=pending.get(data.id);if(!task)return;
          pending.delete(data.id);
          if(data.error)task.reject(Error(data.error));else task.resolve(data.answers);
        };
        worker.onerror=()=>{for(const task of pending.values())task.reject(Error('Calcul Electroverse indisponible'));pending.clear();worker.terminate();worker=null;};
      }
      const id=++sequence;
      return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});worker.postMessage({id,descriptor:d,requests});});
    }
    // Scope answers to a single evaluation pass. Caller does a normal evaluation
    // with exactly the requests collected from its current station/vehicle/session.
    async function evaluate(calculate){
      const requested=new Map();
      const initial=calculate(q=>{requested.set(JSON.stringify(q),q);return null;});
      if(!requested.size)return initial;
      const pairs=[...requested],answers=new Map();
      for(let i=0;i<pairs.length;i+=128){
        const batch=pairs.slice(i,i+128);
        let reply;
        try { reply=await quoteBatch(batch.map(pair=>pair[1])); }
        catch(error) {
          w.console.error('Calcul Electroverse indisponible',error);
          return initial;
        }
        if(!Array.isArray(reply)||reply.length!==batch.length)throw Error('Réponse tarifaire incomplète');
        batch.forEach(([key],j)=>answers.set(key,reply[j]));
      }
      return calculate(q=>answers.get(JSON.stringify(q)));
    }
    return {attach,evaluate,enabled:true,nationalCanonicalSha256:d.nationalCanonicalSha256,gateCodeSha:d.gateCodeSha,
      quote:()=>null};
  }
  root.TCCV9G66Preview={create};
})(globalThis);
