#!/usr/bin/env node
// Offline replay of recorded pinned tuples. Never imports Production UI or ranking.
import fs from 'node:fs';
import {performance} from 'node:perf_hooks';
import {createTariffShadow,PIN} from './v9_tariff_shadow_133.mjs';
const [input,output]=process.argv.slice(2);
if(!input||!output)throw Error('usage: node shadow_bench.mjs phase6-dualrun output');
const source=JSON.parse(fs.readFileSync(input));
if(source.summary.snapshotId!==PIN)throw Error('wrong pin');
const rows=source.rows.filter(r=>r.new);
if(rows.length!==719)throw Error('expected 719 exact priced/other offer rows');
const cohorts=[...new Map(rows.map(r=>[[PIN,r.country,r.cpo,r.channel].join('\u001f'),
  {pin:PIN,country:r.country,cpo:r.cpo,channel:r.channel}])).values()];
const events=[];
let calls=0;
// The Phase 5 record has old status/total/currency, but no old component or
// provenance payload. Do not fabricate those fields to claim comparison.
const current=r=>({status:r.legacy.oldStatus,total:r.legacy.oldTotal,currency:r.legacy.oldCurrency});
const candidate=r=>({status:r.new.status,total:r.new.total,currency:r.new.currency});
const call=(shadow,r,baseline)=>{
  const input={pin:PIN,country:r.country,cpo:r.cpo,channel:r.channel,evseId:r.evseId,
    connectorId:r.connectorId,offerId:r.offerId};
  const response=current(r), ui={response,ranking:[r.offerId]};
  const before=JSON.stringify(ui);
  const t=performance.now();
  const returned=shadow.observe(input,response,()=>{calls++;return candidate(r)});
  const milliseconds=performance.now()-t;
  if(returned!==response||JSON.stringify(ui)!==before)throw Error('UI/ranking mutation');
  baseline.push(milliseconds);
};
const percentile=(numbers,p)=>{const sorted=[...numbers].sort((a,b)=>a-b);return Number(sorted[Math.floor((sorted.length-1)*p)].toFixed(4))};
const measure=(numbers)=>({calls:numbers.length,p50Ms:percentile(numbers,0.5),p95Ms:percentile(numbers,0.95),maxMs:percentile(numbers,1)});
const disabled=createTariffShadow({emit:event=>events.push(event)});
const off=[];for(const r of rows)call(disabled,r,off);
if(calls||events.length)throw Error('default disabled flag evaluated or logged');
const enabled=createTariffShadow({enabledCohorts:cohorts,emit:event=>events.push(event)});
const on=[];for(const r of rows)call(enabled,r,on);
if(calls!==rows.length||enabled.metrics().evaluations!==rows.length)throw Error('enabled replay not complete');
const logged=events.length;
enabled.rollback();
const after=[];for(const r of rows)call(enabled,r,after);
if(calls!==rows.length||events.length!==logged)throw Error('rollback failed');
const logs=JSON.stringify(events);
for(const r of rows){for(const id of [r.evseId,r.connectorId,r.offerId]){
  if(id?.length>=12&&logs.includes(id))throw Error('raw identifier in log');
}}
const result={snapshotId:PIN,mode:'offline recorded-result wrapper replay; not live engine cost',
  rows:rows.length,cohorts:cohorts.length,defaultDisabled:{candidateCalls:0,logs:0,latency:measure(off)},
  enabled:{candidateCalls:calls,metrics:enabled.metrics(),logs:logged,logBytes:Buffer.byteLength(logs),
    comparedFields:['status','total','currency'],unavailableFields:['legacy_components','legacy_provenance'],
    latency:measure(on)},rollback:{candidateCallsAfter:0,logsAfter:0,latency:measure(after)},
  uiResponseIdentityPreserved:true,rankingUnchanged:true,rawIdentifiersLogged:false};
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({rows:result.rows,cohorts:result.cohorts,enabled:result.enabled.latency,rollback:result.rollback.latency}));
