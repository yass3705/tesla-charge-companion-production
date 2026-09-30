#!/usr/bin/env node
import fs from 'node:fs';
import zlib from 'node:zlib';

const [legacyPath,nationalPath,outPath]=process.argv.slice(2);
if(!legacyPath||!nationalPath||!outPath)throw new Error('usage: legacy national out');

const ungzip=p=>JSON.parse(zlib.gunzipSync(fs.readFileSync(p)).toString('utf8'));
const legacy=ungzip(legacyPath);
const national=ungzip(nationalPath);

const norm=x=>String(x??'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
const legacyElectra=[];
for(const row of legacy){
  const stationId=String(row?.[0]??'');
  for(const cfg of row?.[8]||[]){
    const label=String(cfg?.[1]??'');
    if(!/^Electra\s*·/i.test(label))continue;
    const ids=(Array.isArray(cfg?.[6])?cfg[6]:[]).map(String).filter(Boolean);
    if(!ids.length)continue;
    legacyElectra.push({stationId,label,pdcIds:ids});
  }
}
const nationalIds=new Set();
const nationalStations=new Map();
for(const row of national){
  const sid=String(row?.[0]??'');
  const ids=[];
  for(const cfg of row?.[8]||[]){
    for(const id of Array.isArray(cfg?.[6])?cfg[6]:[]){
      ids.push(String(id));
      nationalIds.add(norm(id));
    }
  }
  nationalStations.set(sid,{row,ids});
}
let configsExact=0,configsPartial=0,configsNone=0,totalIds=0,exactIds=0;
const misses=[];
for(const x of legacyElectra){
  totalIds+=x.pdcIds.length;
  const hits=x.pdcIds.filter(id=>nationalIds.has(norm(id)));
  exactIds+=hits.length;
  if(hits.length===x.pdcIds.length)configsExact++;
  else if(hits.length)configsPartial++;
  else {
    configsNone++;
    if(misses.length<100)misses.push({stationId:x.stationId,label:x.label,pdcIds:x.pdcIds});
  }
}
const out={
  legacyElectraConfigs:legacyElectra.length,
  legacyElectraPdcIds:totalIds,
  exactNationalPdcIds:exactIds,
  exactPdcCoveragePct:totalIds?Number((100*exactIds/totalIds).toFixed(3)):0,
  configCoverage:{exact:configsExact,partial:configsPartial,none:configsNone},
  sampleNoMatch:misses,
  policy:'Diagnostic only. No proximity or cross-eMSP inference.'
};
fs.mkdirSync(new URL('.', 'file://'+outPath).pathname,{recursive:true});
fs.writeFileSync(outPath,JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify(out));
