#!/usr/bin/env node
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const [root,ledgerPath]=process.argv.slice(2);
if(!root||!ledgerPath)throw Error('Usage: audit_uk_snapshot_coverage.mjs BUILT_SNAPSHOT DATA_LAB_CPO_LEDGER');
const read=p=>JSON.parse(fs.readFileSync(p));
const gz=p=>JSON.parse(zlib.gunzipSync(fs.readFileSync(p)));
const registry=read(path.join(root,'runtime/data/v9/source-registry.json'));
const active=new Map(registry.sources.filter(s=>s.active).map(s=>[s.id,s]));
const open= require(path.resolve(root,'runtime/assets/v9/adapters/uk-open-feeds.js'));
const allego=require(path.resolve(root,'runtime/assets/v9/adapters/uk-pcpr.js'));
const aggregate=gz(path.join(root,'snapshot-inputs/UK/all.json.gz'));
const byName=new Map(aggregate.sources.map(s=>[s.name,s]));
const aliases={'Evolt':'Evolt Network','Mer':'Mer UK'};
const direct={
  'GRIDSERVE':['uk-gridserve-pcpr-direct','uk_gridserve_v9.json.gz'],
  'Blink':['uk-blink-pcpr-direct','uk_blink_pcpr_v9.json.gz'],
  'Allego':['allego-uk-pcpr-direct','uk_allego_uk_pcpr_v9.json.gz']
};
function summarize(rows,name){
  const connectors=rows.flatMap(s=>s.evses.flatMap(e=>e.connectors));
  const offers=rows.flatMap(s=>s.offers);
  if(offers.some(o=>o.connectorIds?.length!==1||o.evseIds?.length!==1))
    throw Error(`${name}: offer without exact connector and EVSE binding`);
  return {stations:rows.length,connectors:connectors.length,powerKnown:connectors.filter(c=>c.powerKw>0).length,exactOffers:offers.length};
}
const ledger=read(ledgerPath);
const completed=ledger.cpos.filter(c=>['complete','complete_v9_runtime_integrated_validated'].includes(c.status));
const rows=[];
for(const cpo of completed){
  let result={name:cpo.name,ledgerStatus:cpo.status,present:false,source:null,stations:0,connectors:0,powerKnown:0,exactOffers:0};
  const name=aliases[cpo.name]||cpo.name;
  if(active.has('uk-production-open-feeds')&&byName.has(name)){
    const source=byName.get(name);
    result={...result,present:true,source:'uk-production-open-feeds',...summarize(open.normalizePayload({sources:[source]},{sourceId:'uk-production-open-feeds'}),cpo.name)};
  }else if(direct[cpo.name]){
    const [id,file]=direct[cpo.name];
    if(active.has(id)){
      const payload=gz(path.join(root,'snapshot-inputs/UK/sources',file));
      const normalized=cpo.name==='Allego'
        ?allego.normalizePayload(payload,read(path.join(root,'snapshot-inputs/UK/reports/allego_uk-pcpr-validation-latest.json')),active.get(id)).stations
        :open.normalizePayload(payload,{sourceId:id});
      result={...result,present:true,source:id,...summarize(normalized,cpo.name)};
    }
  }
  rows.push(result);
}
const summary={completed:rows.length,present:rows.filter(r=>r.present).length,priced:rows.filter(r=>r.exactOffers>0).length,
  absent:rows.filter(r=>!r.present).map(r=>r.name),presentWithoutVerifiedPrice:rows.filter(r=>r.present&&r.exactOffers===0).map(r=>r.name)};
const batchPath=path.join(root,'snapshot-inputs/UK/direct-batch-report.json');
if(fs.existsSync(batchPath)){
  const batch=read(batchPath);
  for(const [name,expected] of Object.entries(batch)){
    const actual=rows.find(row=>row.name===name);
    if(!actual?.present||actual.stations!==expected.locations||actual.connectors!==expected.connectors||actual.exactOffers!==expected.tariffs)
      throw Error(`${name}: built UK runtime differs from pinned direct batch report`);
  }
}
summary.stationOnly=rows.filter(r=>r.present&&r.connectors===0).map(r=>r.name);
summary.connectorInventoryUnpriced=rows.filter(r=>r.present&&r.connectors>0&&r.exactOffers===0).map(r=>r.name);
summary.pricedComplete=rows.filter(r=>r.present&&r.connectors>0&&r.exactOffers===r.connectors).map(r=>r.name);
summary.pricedPartial=rows.filter(r=>r.present&&r.exactOffers>0&&r.exactOffers<r.connectors).map(r=>r.name);
const out={snapshotId:read(path.join(root,'manifest.json')).snapshotId,summary,cpos:rows};
console.log(JSON.stringify(out,null,2));
