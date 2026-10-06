(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.TCCV9ProductionLoaders=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const join=(base,path)=>`${String(base||'').replace(/\/$/,'')}/${String(path||'').replace(/^\//,'')}`;
  const num=v=>{if(v==null||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;};
  function queryBounds(query={}){
    const lat=num(query?.origin?.lat??query?.origin?.latitude),lon=num(query?.origin?.lon??query?.origin?.longitude),radius=num(query?.radiusKm??query?.maxDistanceKm);
    if(lat==null||lon==null||radius==null||radius<=0)return null;
    const dLat=radius/111.32,dLon=radius/(111.32*Math.max(0.2,Math.cos(lat*Math.PI/180)));
    return{minLat:lat-dLat,maxLat:lat+dLat,minLon:lon-dLon,maxLon:lon+dLon};
  }
  function tileIntersects(tile,b){
    if(!b)return true;
    return Number(tile.maxLat)>=b.minLat&&Number(tile.minLat)<=b.maxLat&&Number(tile.maxLon)>=b.minLon&&Number(tile.minLon)<=b.maxLon;
  }
  function pointInBounds(lat,lon,b){
    if(!b)return true;
    const a=num(lat),o=num(lon);
    return a!=null&&o!=null&&a>=b.minLat&&a<=b.maxLat&&o>=b.minLon&&o<=b.maxLon;
  }
  function filterUkPayload(payload,query){
    const b=queryBounds(query);if(!b)return payload;
    return{...payload,sources:(payload?.sources||[]).map(source=>({
      ...source,
      locations:(source?.locations||[]).filter(loc=>pointInBounds(loc?.coordinates?.latitude,loc?.coordinates?.longitude,b))
    }))};
  }
  async function fetchJsonMaybeGzip(url,fetchImpl){
    const f=fetchImpl||(typeof fetch==='function'?fetch.bind(globalThis):null);if(!f)throw new Error('fetch unavailable');
    const res=await f(url,{cache:'no-cache'});if(!res.ok)throw new Error(`resource unavailable (${res.status}): ${url}`);
    if(!/\.gz(?:$|\?)/i.test(url))return res.json();
    if(typeof DecompressionStream==='undefined')throw new Error('gzip browser decompression unavailable');
    return JSON.parse(await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).text());
  }
  // Cache only the fixed manifest / nationwide overlay sources. Tiles remain
  // query-scoped to avoid retaining an entire country's payload in memory.
  function memoizedJson(url,fetchImpl,cache){
    if(cache.has(url))return cache.get(url);
    const pending=fetchJsonMaybeGzip(url,fetchImpl).catch(err=>{cache.delete(url);throw err;});
    cache.set(url,pending);
    return pending;
  }
  function install({baseLoaders,adapters}={}){
    const target=baseLoaders||root?.TCCV9BrowserLoaders;if(!target?.createRegistryLoaders)throw new Error('base browser loaders missing');
    const de=adapters?.germanyNational||root?.TCCV9Adapters?.germanyNational;
    const uk=adapters?.ukOpenFeeds||root?.TCCV9Adapters?.ukOpenFeeds;
    const ma=adapters?.moroccoPublic||root?.TCCV9Adapters?.moroccoPublic;
    const chAvia=adapters?.switzerlandAvia||root?.TCCV9Adapters?.switzerlandAvia;
    const itIonity=adapters?.italyIonityExact||root?.TCCV9Adapters?.italyIonityExact;
    const frIonity=adapters?.franceIonityExact||root?.TCCV9Adapters?.franceIonityExact;
    const itAtlante=adapters?.atlanteItalyExact||root?.TCCV9Adapters?.atlanteItalyExact;
    const original=target.createRegistryLoaders.bind(target);
    target.createRegistryLoaders=function(opts={}){
      const registry=opts.registry||{sources:[]};
      const basePath=opts.basePath??'..';
      const dataCache=new Map();
      const baseRegistry={...registry,sources:(registry.sources||[]).filter(s=>{
        if(['germany-national-v1','uk-open-feeds-v1','switzerland-avia-v1','italy-ionity-exact-v1','france-ionity-exact-v1','atlante-italy-exact-v1'].includes(s.adapter))return false;
        if(s.adapter==='morocco-public-v1'&&['evgo-production-local','kilowatt-native-local'].includes(s.profile))return false;
        return true;
      })};
      const loaders=original({...opts,registry:baseRegistry});
      for(const source of registry.sources||[]){
        if(source.active===false)continue;
        if(source.adapter==='static-station-json'){
          loaders[source.id]=async query=>{
            const payload=await memoizedJson(join(basePath,source.path),opts.fetchImpl,dataCache);
            const bounds=queryBounds(query);
            return (payload.stations||[]).filter(st=>pointInBounds(st.latitude,st.longitude,bounds));
          };
        }else if(source.adapter==='germany-national-v1'){
          if(!de?.normalizePayload)throw new Error('germany adapter missing');
          loaders[source.id]=async query=>{
            let payload;
            const bounds=queryBounds(query);
            if(bounds&&source.tileManifest&&source.tileRoot){
              const manifest=await memoizedJson(join(basePath,source.tileManifest),opts.fetchImpl,dataCache);
              const tiles=(manifest.tiles||[]).filter(t=>tileIntersects(t,bounds));
              const parts=await Promise.all(tiles.map(t=>fetchJsonMaybeGzip(join(basePath,source.tileRoot+t.file),opts.fetchImpl)));
              payload={sites:parts.flatMap(x=>Array.isArray(x)?x:(x?.sites||[]))};
            }else{
              payload=await fetchJsonMaybeGzip(join(basePath,source.path),opts.fetchImpl);
            }
            const ionityPayload=source.ionityPath?await memoizedJson(join(basePath,source.ionityPath),opts.fetchImpl,dataCache):null;
            return de.normalizePayload(payload,{sourceId:source.id,ionityPayload});
          };
        }else if(source.adapter==='uk-open-feeds-v1'){
          if(!uk?.normalizePayload)throw new Error('UK adapter missing');
          loaders[source.id]=async query=>{
            const payload=await memoizedJson(join(basePath,source.path),opts.fetchImpl,dataCache);
            return uk.normalizePayload(filterUkPayload(payload,query),{sourceId:source.id});
          };
        }else if(source.adapter==='morocco-public-v1'&&source.profile==='evgo-production-local'){
          if(!ma?.normalizeEvgoDataset||!ma?.evgoOverlayFreshness)throw new Error('Morocco EVGO adapter missing');
          loaders[source.id]=async()=>{
            const payload=await fetchJsonMaybeGzip(join(basePath,source.path),opts.fetchImpl);
            const freshness=ma.evgoOverlayFreshness(payload,Number(source.freshnessMaxMinutes||120));
            return ma.normalizeEvgoDataset(payload,{sourceId:source.id,statusFresh:freshness.fresh,statusGeneratedAt:freshness.generatedAt});
          };
        }else if(source.adapter==='switzerland-avia-v1'){
          if(!chAvia?.normalizePayload)throw new Error('Switzerland AVIA adapter missing');
          loaders[source.id]=async()=>chAvia.normalizePayload(
            await fetchJsonMaybeGzip(join(basePath,source.path),opts.fetchImpl),
            source
          );
        }else if(source.adapter==='italy-ionity-exact-v1'){
          if(!itIonity?.normalizePayload)throw new Error('Italy IONITY exact adapter missing');
          loaders[source.id]=async()=>itIonity.normalizePayload(
            await fetchJsonMaybeGzip(join(basePath,source.path),opts.fetchImpl),
            source
          );
        }else if(source.adapter==='france-ionity-exact-v1'){
          if(!frIonity?.normalizePayload)throw new Error('France IONITY exact adapter missing');
          loaders[source.id]=async()=>frIonity.normalizePayload(
            await fetchJsonMaybeGzip(join(basePath,source.path),opts.fetchImpl),
            source
          );
        }else if(source.adapter==='atlante-italy-exact-v1'){
          if(!itAtlante?.normalizePayload)throw new Error('Atlante Italy exact adapter missing');
          loaders[source.id]=async()=>itAtlante.normalizePayload(
            await fetchJsonMaybeGzip(join(basePath,source.path),opts.fetchImpl),
            source
          );
        }else if(source.adapter==='morocco-public-v1'&&source.profile==='kilowatt-native-local'){
          if(!ma?.normalizeKilowattNativeDataset||!ma?.kilowattNativeFreshness)throw new Error('Morocco Kilowatt adapter missing');
          loaders[source.id]=async()=>{
            const inventory=await fetchJsonMaybeGzip(join(basePath,source.paths.inventory),opts.fetchImpl);
            const native=await fetchJsonMaybeGzip(join(basePath,source.paths.native),opts.fetchImpl);
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
