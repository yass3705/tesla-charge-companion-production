(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.TCCV9ProductionLoaders=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const join=(base,path)=>`${String(base||'').replace(/\/$/,'')}/${String(path||'').replace(/^\//,'')}`;
  async function fetchJsonMaybeGzip(url,fetchImpl){
    const f=fetchImpl||(typeof fetch==='function'?fetch.bind(globalThis):null);if(!f)throw new Error('fetch unavailable');
    const res=await f(url,{cache:'no-cache'});if(!res.ok)throw new Error(`resource unavailable (${res.status}): ${url}`);
    if(!/\.gz(?:$|\?)/i.test(url))return res.json();
    if(typeof DecompressionStream==='undefined')throw new Error('gzip browser decompression unavailable');
    return JSON.parse(await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).text());
  }
  function install({baseLoaders,adapters}={}){
    const target=baseLoaders||root?.TCCV9BrowserLoaders;if(!target?.createRegistryLoaders)throw new Error('base browser loaders missing');
    const de=adapters?.germanyNational||root?.TCCV9Adapters?.germanyNational;
    const uk=adapters?.ukOpenFeeds||root?.TCCV9Adapters?.ukOpenFeeds;
    const ma=adapters?.moroccoPublic||root?.TCCV9Adapters?.moroccoPublic;
    const original=target.createRegistryLoaders.bind(target);
    target.createRegistryLoaders=function(opts={}){
      const registry=opts.registry||{sources:[]};
      const baseRegistry={...registry,sources:(registry.sources||[]).filter(s=>{
        if(['germany-national-v1','uk-open-feeds-v1'].includes(s.adapter))return false;
        if(s.adapter==='morocco-public-v1'&&['evgo-production-local','kilowatt-native-local'].includes(s.profile))return false;
        return true;
      })};
      const loaders=original({...opts,registry:baseRegistry});
      for(const source of registry.sources||[]){
        if(source.active===false)continue;
        if(source.adapter==='germany-national-v1'){
          if(!de?.normalizePayload)throw new Error('germany adapter missing');
          loaders[source.id]=async()=>{
            const payload=await fetchJsonMaybeGzip(join(opts.basePath,source.path),opts.fetchImpl);
            const ionityPayload=source.ionityPath?await fetchJsonMaybeGzip(join(opts.basePath,source.ionityPath),opts.fetchImpl):null;
            return de.normalizePayload(payload,{sourceId:source.id,ionityPayload});
          };
        }else if(source.adapter==='uk-open-feeds-v1'){
          if(!uk?.normalizePayload)throw new Error('UK adapter missing');
          loaders[source.id]=async()=>uk.normalizePayload(await fetchJsonMaybeGzip(join(opts.basePath,source.path),opts.fetchImpl),{sourceId:source.id});
        }else if(source.adapter==='morocco-public-v1'&&source.profile==='evgo-production-local'){
          if(!ma?.normalizeEvgoDataset||!ma?.evgoOverlayFreshness)throw new Error('Morocco EVGO adapter missing');
          loaders[source.id]=async()=>{
            const payload=await fetchJsonMaybeGzip(join(opts.basePath,source.path),opts.fetchImpl);
            const freshness=ma.evgoOverlayFreshness(payload,Number(source.freshnessMaxMinutes||120));
            return ma.normalizeEvgoDataset(payload,{sourceId:source.id,statusFresh:freshness.fresh,statusGeneratedAt:freshness.generatedAt});
          };
        }else if(source.adapter==='morocco-public-v1'&&source.profile==='kilowatt-native-local'){
          if(!ma?.normalizeKilowattNativeDataset||!ma?.kilowattNativeFreshness)throw new Error('Morocco Kilowatt adapter missing');
          loaders[source.id]=async()=>{
            const inventory=await fetchJsonMaybeGzip(join(opts.basePath,source.paths.inventory),opts.fetchImpl);
            const native=await fetchJsonMaybeGzip(join(opts.basePath,source.paths.native),opts.fetchImpl);
            const freshness=ma.kilowattNativeFreshness(native,Number(source.freshnessMaxMinutes||1560));
            return ma.normalizeKilowattNativeDataset(inventory,native,{sourceId:source.id,statusFresh:freshness.fresh,statusGeneratedAt:freshness.generatedAt,minStations:Number(source.expectedMinStations||43),minConnectors:Number(source.expectedMinConnectors||80)});
          };
        }
      }
      return loaders;
    };
    return target;
  }
  return{install,fetchJsonMaybeGzip};
});
