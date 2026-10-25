(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.TCCV9PreparedCandidate=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const sourcePattern=/^[A-Z]{2}:[a-z0-9_]+$/;
  const shaPattern=/^[a-f0-9]{64}$/;
  function candidateUrl(base,path){
    const anchor=String(base||'').replace(/\/$/,'')+'/';
    return new URL(path,anchor).toString();
  }
  async function sha256Hex(bytes,cryptoImpl){
    const impl=cryptoImpl||root?.crypto;
    if(!impl?.subtle?.digest)throw new Error('preproduction SHA verification unavailable');
    const hash=new Uint8Array(await impl.subtle.digest('SHA-256',bytes));
    return Array.from(hash,b=>b.toString(16).padStart(2,'0')).join('');
  }
  async function loadPrepared({baseUrl,fetchImpl,adapter,cryptoImpl,origin,expectedIndexSha256}={}){
    if(!adapter?.toFragments)throw new Error('canonical adapter missing');
    const base=new URL(String(baseUrl||''),origin||root?.location?.href||'http://localhost/');
    if(base.protocol!=='https:'&&base.hostname!=='localhost'&&base.hostname!=='127.0.0.1')
      throw new Error('insecure preproduction origin');
    if(origin&&base.origin!==new URL(origin).origin)throw new Error('external preproduction origin blocked');
    const fetcher=fetchImpl||root?.fetch?.bind(root);
    if(typeof fetcher!=='function')throw new Error('preview fetch unavailable');
    async function jsonAt(url,expectedSha,encoding,expectedBytes,uncompressedBytes){
      const response=await fetcher(url,{cache:'no-store'});
      if(!response?.ok)throw new Error('candidate resource unavailable');
      const raw=await response.arrayBuffer();
      if(expectedBytes!=null&&raw.byteLength!==expectedBytes)throw new Error('candidate source length mismatch');
      if(expectedSha&&await sha256Hex(raw,cryptoImpl)!==expectedSha)throw new Error('candidate source SHA mismatch');
      if(encoding==null)return JSON.parse(new TextDecoder().decode(raw));
      if(encoding!=='gzip'||typeof root?.DecompressionStream!=='function'||
         typeof root?.Response!=='function'||typeof root?.Blob!=='function')
        throw new Error('candidate gzip decoding unavailable');
      let decoded;
      try{
        decoded=await new root.Response(new root.Blob([raw]).stream()
          .pipeThrough(new root.DecompressionStream('gzip'))).arrayBuffer();
      }catch(_){throw new Error('candidate gzip invalid');}
      if(decoded.byteLength!==uncompressedBytes)throw new Error('candidate decoded length mismatch');
      return JSON.parse(new TextDecoder().decode(decoded));
    }
    if(expectedIndexSha256!=null&&!shaPattern.test(expectedIndexSha256))
      throw new Error('pinned candidate index SHA invalid');
    const index=await jsonAt(candidateUrl(base,'index.json'),expectedIndexSha256);
    if(![1,2].includes(index?.schemaVersion)||!['prepared','partial_failure'].includes(index.status)||
       !Array.isArray(index.sources)||!Array.isArray(index.rejected)||!index.sources.length)
      throw new Error('candidate index invalid');
    const sources=[],loaders={},seen=new Set();
    function shardApplies(descriptor,query){
      if(descriptor.bbox==null||!query?.origin||!Number.isFinite(Number(query.radiusKm)))return true;
      const lat=Number(query.origin.lat??query.origin.latitude),lon=Number(query.origin.lon??query.origin.longitude);
      if(!Number.isFinite(lat)||!Number.isFinite(lon))return true;
      const [south,west,north,east]=descriptor.bbox,radius=Math.max(0,Number(query.radiusKm));
      const latMargin=radius/100+0.1;
      const polar=Math.min(89.99,Math.max(Math.abs(lat)+latMargin,Math.abs(south),Math.abs(north)));
      const lonMargin=Math.min(180,radius/(100*Math.max(.01,Math.cos(polar*Math.PI/180)))+0.1);
      return lat>=south-latMargin&&lat<=north+latMargin&&lon>=west-lonMargin&&lon<=east+lonMargin;
    }
    for(const entry of index.sources){
      const id=entry?.source,path=entry?.path,expectedPath='sources/'+String(id||'').replace(':','__')+'.json';
      if(!sourcePattern.test(id)||seen.has(id)||
         (index.schemaVersion===1?(path!==expectedPath||!shaPattern.test(entry.sha256)):
           !shaPattern.test(entry.sourceSha256)||!shaPattern.test(entry.sourceArtifactSha256)||
           !Array.isArray(entry.shards)||!entry.shards.length||entry.shards.some((shard,i)=>
             ![null,'gzip'].includes(shard.encoding??null)||
             shard.path!==`shards/${id.replace(':','__')}__${String(i).padStart(4,'0')}.json${shard.encoding==='gzip'?'.bin':''}`||
             !shaPattern.test(shard.sha256)||!Number.isInteger(shard.bytes)||shard.bytes<1||
             shard.bytes>8000000||
             (shard.encoding==='gzip'&&(!Number.isInteger(shard.uncompressedBytes)||
               shard.uncompressedBytes<1||shard.uncompressedBytes>8000000))||
             !Number.isInteger(shard.stationCount)||shard.stationCount<1||
             (shard.bbox!=null&&(!Array.isArray(shard.bbox)||shard.bbox.length!==4||
               shard.bbox.some(value=>!Number.isFinite(value)))))))
        throw new Error('candidate source descriptor invalid');
      seen.add(id);
      const registryId='prepared:'+id;
      sources.push({id:registryId,countries:[id.slice(0,2)],priority:100,active:true,optional:false});
      let pending=null;
      const shardPending=new Map();
      const adaptData=data=>{
          if(data?.schemaVersion!==1||data?.source?.id!==id||
             (index.schemaVersion===2&&data.source.artifactSha256!==entry.sourceArtifactSha256)||
             !Array.isArray(data.stations)||!Array.isArray(data.evses)||
             !Array.isArray(data.connectors)||!Array.isArray(data.offers))
            throw new Error('candidate source schema or identity invalid');
          const fragments=adapter.toFragments(data);
          const rawOffers=new Map(data.offers.map(row=>[row.id,row]));
          const rawEvses=new Map(data.evses.map(row=>[row.id,row]));
          const rawConnectors=new Map(data.connectors.map(row=>[row.id,row]));
          const rawCpos=new Map((data.cpos||[]).map(row=>[row.id,row]));
          const offerCounts=new Map(),connectorOfferCounts=new Map();
          if(id==='BE:nap_static')for(const row of data.offers)
            offerCounts.set(row.scope?.evseId,(offerCounts.get(row.scope?.evseId)||0)+1);
          if(id==='NL:dotnl_static')for(const row of data.offers)
            connectorOfferCounts.set(row.scope?.connectorId,(connectorOfferCounts.get(row.scope?.connectorId)||0)+1);
          const provedOffer=(fragment,offer)=>{
            if(id==='FR:emsp_exact'){
              const raw=rawOffers.get(offer?.id),evse=rawEvses.get(raw?.scope?.evseId),source=raw?.rawOffer;
              const local=fragment.evses.find(row=>row.id===evse?.id);
              const connectorIds=(local?.connectors||[]).filter(row=>row.powerKw>0).map(row=>row.id).sort();
              const rule=offer?.pricing?.rules?.[0];
              return fragment.countryCode==='FR'&&offer?.kind==='roaming'&&
                offer.provider==='Electroverse'&&offer.currency==='EUR'&&
                offer.metadata?.verified===true&&offer.metadata?.identityMode==='exact_canonical_emsp_evse'&&
                offer.metadata?.sourceId===id&&offer.metadata?.artifactSha256===data.source.artifactSha256&&
                offer.metadata?.sourceOfferId===source?.id&&offer.metadata?.timeZone==='Europe/Paris'&&
                raw?.channel==='Electroverse'&&raw.calculationStatus==='not_evaluated'&&
                raw.scope?.connectorId==null&&source?.id===raw.sourceOfferId&&
                source.provider==='Electroverse'&&source.verifiedScope==='exact_evse'&&
                source.metadata?.verified===true&&
                source.metadata?.identityMode==='exact_unique_national_irve_pdc'&&
                Array.isArray(source.evseIds)&&source.evseIds.length===1&&
                source.evseIds[0]===evse?.officialEvseId&&raw.officialEvseId===evse?.officialEvseId&&
                Array.isArray(offer.evseIds)&&offer.evseIds.length===1&&offer.evseIds[0]===evse?.id&&
                Array.isArray(offer.connectorIds)&&connectorIds.length>0&&
                JSON.stringify(offer.connectorIds.slice().sort())===JSON.stringify(connectorIds)&&
                offer.pricing?.type==='rules'&&offer.pricing.rules?.length===1&&
                JSON.stringify(offer.pricing)===JSON.stringify(source.pricing)&&
                Object.keys(rule||{}).sort().join(',')===
                  'afterMinutesRate,afterMinutesThreshold,billing,chargePerMinute,connectionFee,currency,days,end,idlePerMinute,ocpiDurationBands,pricePerKwh,scope,start'&&
                rule.scope==='allDay'&&rule.start==='00:00'&&rule.end==='24:00'&&
                rule.currency==='EUR'&&rule.billing==='kwh'&&rule.days==null&&
                Array.isArray(rule.ocpiDurationBands)&&rule.ocpiDurationBands.length===0&&
                rule.afterMinutesRate===0&&rule.afterMinutesThreshold===0&&
                ['pricePerKwh','chargePerMinute','connectionFee','idlePerMinute'].every(name=>
                  typeof rule[name]==='number'&&Number.isFinite(rule[name])&&rule[name]>=0)&&
                rule.pricePerKwh>0;
            }
            if(['GB:blink_pcpr_direct','GB:allego_pcpr_direct','GB:source_ev_pcpr_direct'].includes(id)){
              const raw=rawOffers.get(offer?.id),evse=rawEvses.get(raw?.scope?.evseId);
              const connector=rawConnectors.get(raw?.scope?.connectorId),tariff=raw?.rawOffer;
              const local=fragment.evses.find(row=>row.id===evse?.id);
              const recipe=root?.TCCV9Adapters?.ukOpenFeeds?.pcprDirectPricing?.(tariff);
              const restriction=tariff?.elements?.[0]?.restrictions||{};
              const components=tariff?.elements?.[0]?.price_components;
              const componentKinds=(components||[]).map(row=>row.type);
              return fragment.countryCode==='GB'&&offer?.kind==='direct'&&offer.currency==='GBP'&&
                offer.metadata?.verified===true&&offer.metadata.identityMode==='exact_canonical_connector_pcpr'&&
                offer.metadata.sourceId===id&&offer.metadata.artifactSha256===data.source.artifactSha256&&
                offer.metadata.sourceTariffKey===raw?.sourceTariffKey&&offer.metadata.timeZone==='Europe/London'&&
                raw?.channel==='Direct'&&raw.calculationStatus==='not_evaluated'&&
                raw.scope?.evseId===evse?.id&&raw.scope?.connectorId===connector?.id&&
                connector?.evseId===evse?.id&&connector.powerKw>0&&
                local?.connectors.some(row=>row.id===connector.id&&row.powerKw===connector.powerKw)&&
                Array.isArray(offer.evseIds)&&offer.evseIds.length===1&&offer.evseIds[0]===evse.id&&
                Array.isArray(offer.connectorIds)&&offer.connectorIds.length===1&&offer.connectorIds[0]===connector.id&&
                Array.isArray(connector.rawSourceFields?.tariff_ids)&&connector.rawSourceFields.tariff_ids.length===1&&
                connector.rawSourceFields.tariff_ids[0]===raw.sourceTariffKey&&
                JSON.stringify(connector.rawSourceFields.sourceTariffIds)===JSON.stringify([raw.sourceTariffKey])&&
                tariff?.id===raw.sourceTariffKey&&
                JSON.stringify(tariff)===JSON.stringify(data.tariffCatalog?.[raw.sourceTariffKey])&&
                tariff.currency==='GBP'&&tariff.tccPriceBasis==='GBP_including_public_UK_VAT'&&
                tariff.tccSourcePriceBasis==='OCPI_2.2.1_excluding_VAT'&&
                tariff.elements?.length===1&&Object.keys(restriction).join(',')==='start_date'&&
                typeof restriction.start_date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(restriction.start_date)&&
                !Number.isNaN(Date.parse(restriction.start_date+'T00:00:00Z'))&&
                new Date(restriction.start_date+'T00:00:00Z').toISOString().slice(0,10)===restriction.start_date&&
                Array.isArray(components)&&components.length>0&&
                componentKinds.includes('ENERGY')&&new Set(componentKinds).size===componentKinds.length&&
                components.every(row=>['ENERGY','TIME','FLAT','PARKING_TIME'].includes(row.type)&&
                  typeof row.price==='number'&&Number.isFinite(row.price)&&row.price>=0&&
                  Number.isInteger(row.step_size)&&row.step_size>=1&&row.tccVatRateAppliedPct===20&&
                  Object.keys(row).sort().join(',')===
                    'price,sourcePriceExVat,step_size,tccVatOrigin,tccVatRateAppliedPct,type,vat')&&
                components.find(row=>row.type==='ENERGY').price>0&&
                recipe?.type==='component_groups'&&recipe.ocpiFirstMatch===true&&
                recipe.taxIncluded===true&&recipe.timeZone==='Europe/London'&&
                JSON.stringify(offer.pricing)===JSON.stringify(recipe);
            }
            if(fragment.countryCode!==id.slice(0,2)||offer?.metadata?.sourceId!==id||
               offer.metadata.verified!==true||offer.metadata.artifactSha256!==data.source.artifactSha256||
               offer.kind!=='direct'||offer.currency!==(id==='GB:ionity_direct'?'GBP':'EUR')||
               !Array.isArray(offer.evseIds)||offer.evseIds.length!==1||
               !Array.isArray(offer.connectorIds)||!offer.connectorIds.length||
               offer.pricing?.type!=='rules'||Object.keys(offer.pricing).sort().join(',')!=='rules,type'||
               offer.pricing.rules?.length!==1)return false;
            const rule=offer.pricing.rules[0],raw=rawOffers.get(offer.id);
            const ordinaryRule='afterMinutesRate,afterMinutesThreshold,billing,chargePerMinute,connectionFee,currency,end,idlePerMinute,pricePerKwh,scope,start';
            const nlRequired=['afterMinutesRate','afterMinutesThreshold','billing','chargePerMinute','connectionFee','currency','end','energyStepWh','idlePerMinute','pricePerKwh','scope','start'];
            const nlAllowed=new Set([...nlRequired,'chargingTimeStepSeconds','parkingTimeStepSeconds',
              'validFromDate','validThroughDate','daysOfWeek','minDurationMinutes','maxDurationMinutes',
              'minPowerKw','maxPowerKw']);
            if((id==='NL:dotnl_static'?
                 nlRequired.some(key=>!Object.prototype.hasOwnProperty.call(rule,key))||
                   Object.keys(rule).some(key=>!nlAllowed.has(key)):
                 Object.keys(rule).sort().join(',')!==ordinaryRule)||
               (id!=='NL:dotnl_static'&&
                 (rule.scope!=='allDay'||rule.start!=='00:00'||rule.end!=='24:00'))||
               rule.billing!=='kwh'||
               rule.currency!==(id==='GB:ionity_direct'?'GBP':'EUR')||
               !Number.isFinite(rule.pricePerKwh)||rule.pricePerKwh<0||
               (id==='NL:dotnl_static'?
                 !['afterMinutesRate','afterMinutesThreshold'].every(key=>rule[key]===0):
                 !['chargePerMinute','connectionFee','idlePerMinute','afterMinutesRate','afterMinutesThreshold']
                   .every(key=>rule[key]===0))||!raw||raw.channel!=='Direct'||
               raw.scope?.evseId!==offer.evseIds[0]||raw.calculationStatus!=='not_evaluated')return false;
            const local=fragment.evses.find(evse=>evse.id===offer.evseIds[0]);
            if(!local||!offer.connectorIds.every(connectorId=>
              local.connectors.some(connector=>connector.id===connectorId&&connector.powerKw>0)))return false;
            if(id==='BE:nap_static'){
              const source=rawEvses.get(offer.evseIds[0]),price=raw.rawOffer;
              return offer.metadata.identityMode==='exact_canonical_evse_supported_connectors'&&
                raw.scope?.connectorId==null&&source?.unclassifiedPrices?.length===0&&
                offerCounts.get(offer.evseIds[0])===1&&price?.ratePolicy==='adHoc'&&
                price.priceType==='pricePerKWh'&&price.currency==='EUR'&&
                price.taxIncluded===false&&price.taxRate===21&&
                typeof price.value==='number'&&price.value>=0&&price.value<=3&&
                Math.round(price.value*1.21*1e8)/1e8===rule.pricePerKwh&&
                (source.archiveVariants||[]).every(row=>row.prices?.length===1&&
                  JSON.stringify(row.prices[0])===JSON.stringify(price));
            }
            if(id==='NL:dotnl_static'){
              const tariff=data.tariffCatalog?.[raw.sourceTariffKey];
              const element=tariff?.elements?.[0],components=element?.priceComponents;
              const restrictions=element?.restrictions;
              const activeRestrictions=restrictions?Object.entries(restrictions).filter(([,value])=>
                Array.isArray(value)?value.length:value!=null&&value!==''):[];
              const energy=Array.isArray(components)?components.filter(component=>component.type==='ENERGY'):[];
              const byType=new Map();
              if(!Array.isArray(components))return false;
              for(const component of components){
                if(!['ENERGY','TIME','FLAT','PARKING_TIME'].includes(component.type)||
                   byType.has(component.type)||!Number.isFinite(component.priceInclVat)||
                   component.priceInclVat<0||!Number.isInteger(component.stepSize)||
                   component.stepSize<0||
                   (component.priceInclVat>0&&component.type!=='FLAT'&&component.stepSize<1))return false;
                byType.set(component.type,component);
              }
              const paidTime=byType.get('TIME')?.priceInclVat||0;
              const paidParking=byType.get('PARKING_TIME')?.priceInclVat||0;
              const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&
                !Number.isNaN(Date.parse(value+'T00:00:00Z'))&&
                new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
              const validClock=(value,end)=>typeof value==='string'&&/^\d{2}:\d{2}$/.test(value)&&
                (value==='24:00'?end:Number(value.slice(0,2))<24&&Number(value.slice(3))<60);
              const allowedRestrictions=new Set(['start_date','end_date','start_time','end_time',
                'day_of_week','min_duration','max_duration','min_power','max_power']);
              const restrictionsMap=Object.fromEntries(activeRestrictions);
              const weekday={SUNDAY:0,MONDAY:1,TUESDAY:2,WEDNESDAY:3,THURSDAY:4,FRIDAY:5,SATURDAY:6};
              const expectedDays=restrictionsMap.day_of_week==null?undefined:
                Array.isArray(restrictionsMap.day_of_week)?restrictionsMap.day_of_week.map(day=>
                  typeof day==='number'?(day===7?0:day):weekday[String(day).toUpperCase()]):null;
              const expectedStart=restrictionsMap.start_time||'00:00';
              const expectedEnd=restrictionsMap.end_time||'24:00';
              return offer.metadata.identityMode==='exact_canonical_connector_ocpi'&&
                offer.connectorIds.length===1&&raw.scope?.connectorId===offer.connectorIds[0]&&
                connectorOfferCounts.get(offer.connectorIds[0])===1&&
                Object.keys(raw.rawOffer||{}).join(',')==='tariffKey'&&
                raw.rawOffer.tariffKey===raw.sourceTariffKey&&
                tariff?.tariffKey===raw.sourceTariffKey&&
                [null,'REGULAR','AD_HOC_PAYMENT'].includes(tariff.type)&&
                tariff.currency==='EUR'&&tariff.startDateTime==null&&tariff.endDateTime==null&&
                tariff.minPrice==null&&tariff.maxPrice==null&&tariff.elements.length===1&&
                activeRestrictions.every(([name])=>allowedRestrictions.has(name))&&
                (restrictionsMap.start_date==null||validDate(restrictionsMap.start_date))&&
                (restrictionsMap.end_date==null||validDate(restrictionsMap.end_date))&&
                (restrictionsMap.start_date==null||restrictionsMap.end_date==null||
                  restrictionsMap.start_date<=restrictionsMap.end_date)&&
                (restrictionsMap.start_time==null||validClock(restrictionsMap.start_time,false))&&
                (restrictionsMap.end_time==null||validClock(restrictionsMap.end_time,true))&&
                (expectedDays===undefined||Array.isArray(expectedDays)&&expectedDays.length>0&&
                  expectedDays.every(day=>Number.isInteger(day)&&day>=0&&day<=6))&&
                ['min_duration','max_duration','min_power','max_power'].every(name=>
                  restrictionsMap[name]==null||Number.isFinite(restrictionsMap[name])&&
                    restrictionsMap[name]>=0)&&
                (restrictionsMap.min_duration==null||restrictionsMap.max_duration==null||
                  restrictionsMap.min_duration<=restrictionsMap.max_duration)&&
                (restrictionsMap.min_power==null||restrictionsMap.max_power==null||
                  restrictionsMap.min_power<=restrictionsMap.max_power)&&
                rule.validFromDate===restrictionsMap.start_date&&
                rule.validThroughDate===restrictionsMap.end_date&&
                rule.start===expectedStart&&rule.end===expectedEnd&&
                rule.scope===(expectedStart==='00:00'&&expectedEnd==='24:00'?'allDay':'timeWindow')&&
                JSON.stringify(rule.daysOfWeek)===JSON.stringify(expectedDays)&&
                rule.minDurationMinutes===(restrictionsMap.min_duration==null?undefined:
                  restrictionsMap.min_duration/60)&&
                rule.maxDurationMinutes===(restrictionsMap.max_duration==null?undefined:
                  restrictionsMap.max_duration/60)&&
                rule.minPowerKw===restrictionsMap.min_power&&
                rule.maxPowerKw===restrictionsMap.max_power&&
                energy.length===1&&energy[0].priceInclVat===rule.pricePerKwh&&
                energy[0].stepSize===rule.energyStepWh&&
                Number.isInteger(rule.energyStepWh)&&rule.energyStepWh>=1&&
                rule.connectionFee===(byType.get('FLAT')?.priceInclVat||0)&&
                rule.idlePerMinute===paidParking/60&&
                rule.chargePerMinute===paidTime/60&&
                (paidTime>0?
                  rule.chargingTimeStepSeconds===byType.get('TIME').stepSize:
                  rule.chargingTimeStepSeconds==null)&&
                (paidParking>0?rule.parkingTimeStepSeconds===byType.get('PARKING_TIME').stepSize:
                  rule.parkingTimeStepSeconds==null);
            }
            if(!['FR:ionity_direct','DE:ionity_direct','IT:ionity_direct','GB:ionity_direct','IT:atlante_direct'].includes(id)||
               offer.metadata.identityMode!=='exact_canonical_connector'||
               offer.connectorIds.length!==1||raw.scope?.connectorId!==offer.connectorIds[0]||
               rule.pricePerKwh<=0)return false;
            if(['FR:ionity_direct','DE:ionity_direct','IT:ionity_direct','GB:ionity_direct'].includes(id)){
              const connector=rawConnectors.get(raw.scope.connectorId);
              const evse=rawEvses.get(raw.scope.evseId);
              const field=id==='GB:ionity_direct'?'pricePerKwhGbp':'pricePerKwhEur';
              return offer.provider==='IONITY Direct'&&
                Object.keys(raw.rawOffer||{}).join(',')===field&&
                raw.rawOffer[field]===rule.pricePerKwh&&
                connector?.evseId===evse?.id&&connector?.sourceConnectorId===raw.sourceConnectorId&&
                connector?.rawSourceFields?.uuid===raw.sourceConnectorId&&
                connector?.rawSourceFields?.[field]===rule.pricePerKwh&&
                ['AC','DC'].includes(connector.rawSourceFields.kind)&&
                rawCpos.get(evse?.cpoId)?.sourceOperatorId==='IONITY_CPO';
            }
            return offer.provider==='Atlante direct'&&raw.rawOffer?.priceComponents?.length===1&&
              raw.rawOffer.priceComponents[0]?.priceDimension==='ENERGY'&&
              raw.rawOffer.priceComponents[0]?.price?.incl_vat===rule.pricePerKwh;
          };
          if(fragments.some(f=>f.countryCode!==id.slice(0,2)||
             f.offers.some(offer=>!provedOffer(f,offer))))
            throw new Error('candidate pricing isolation violated');
          return fragments;
      };
      loaders[registryId]=async function(query){
        if(index.schemaVersion===2){
          // The exact French eMSP derivative copies national station identity
          // and coordinates. Coordinate-less source shards have a null bbox
          // and are still loaded so they can join through an exact key.
          const chosen=entry.shards.filter(shard=>shardApplies(shard,query));
          const results=await Promise.all(chosen.map(shard=>{
            if(!shardPending.has(shard.path)){
              const task=jsonAt(candidateUrl(base,shard.path),shard.sha256,shard.encoding,
                shard.bytes,shard.uncompressedBytes).then(adaptData)
                .catch(error=>{shardPending.delete(shard.path);throw error;});
              shardPending.set(shard.path,task);
            }
            return shardPending.get(shard.path);
          }));
          return results.flat();
        }
        if(!pending)pending=jsonAt(candidateUrl(base,path),entry.sha256).then(adaptData)
          .catch(error=>{pending=null;throw error;});
        return pending;
      };
    }
    if(index.status==='partial_failure'&&!index.rejected.length)
      throw new Error('partial candidate missing failure report');
    return{registry:{sources,subscriptionCoverage:[]},loaders,
      candidate:{status:index.status,bundleId:index.bundleId,rejected:index.rejected.map(x=>({source:x.source,reason:x.reason}))}};
  }
  return{loadPrepared,sha256Hex};
});
