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
    const original=target.createRegistryLoaders.bind(target);
    target.createRegistryLoaders=function(opts={}){
      const registry=opts.registry||{sources:[]};
      const baseRegistry={...registry,sources:(registry.sources||[]).filter(s=>!['germany-national-v1','uk-open-feeds-v1'].includes(s.adapter))};
      const loaders=original({...opts,registry:baseRegistry});
      for(const source of registry.sources||[]){
        if(source.active===false)continue;
        if(source.adapter==='germany-national-v1'){
          if(!de?.normalizePayload)throw new Error('germany adapter missing');
          loaders[source.id]=async()=>de.normalizePayload(await fetchJsonMaybeGzip(join(opts.basePath,source.path),opts.fetchImpl),{sourceId:source.id});
        }else if(source.adapter==='uk-open-feeds-v1'){
          if(!uk?.normalizePayload)throw new Error('UK adapter missing');
          loaders[source.id]=async()=>uk.normalizePayload(await fetchJsonMaybeGzip(join(opts.basePath,source.path),opts.fetchImpl),{sourceId:source.id});
        }
      }
      return loaders;
    };
    return target;
  }
  return{install,fetchJsonMaybeGzip};
});
