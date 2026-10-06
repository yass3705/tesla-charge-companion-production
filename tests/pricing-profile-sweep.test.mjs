import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const root=path.resolve(process.argv[2]||'dist/v9-explicit-candidate');
const report=JSON.parse(fs.readFileSync(path.resolve(process.argv[3]||'tariff-audit/profile-inventory.json'),'utf8'));
const pricing=require(path.join(root,'runtime/assets/v9/pricing-engine.js'));
const sessionEngine=require(path.join(root,'runtime/assets/v9/session-engine.js'));
const cache=new Map(),reasons=new Map(),visited=new Set();
function dataFor(file){
  if(!cache.has(file)){
    const bytes=fs.readFileSync(path.join(root,file));
    cache.set(file,JSON.parse((file.endsWith('.gz')?zlib.gunzipSync(bytes):bytes).toString('utf8')));
  }
  return cache.get(file);
}
function findOffer(value,id,kind){
  if(Array.isArray(value)){
    for(const row of value){const found=findOffer(row,id,kind);if(found)return found}
    return null;
  }
  if(!value||typeof value!=='object')return null;
  if(value.id===id&&value.pricing?.type===kind)return value;
  for(const [key,row] of Object.entries(value)){
    if(key==='pricing'||(!Array.isArray(row)&&(!row||typeof row!=='object')))continue;
    const found=findOffer(row,id,kind);if(found)return found;
  }
  return null;
}
const base={startAt:'2026-10-06T12:00:00Z',timeZone:'Europe/Paris',durationMinutes:60,energyKwh:10,chargingMinutes:60,postChargeMinutes:0,powerKw:50,vehicleSoc:90,congestionPct:90,chargeTimeline:[{offsetMinutes:0,durationMinutes:60,energyKwh:10,powerKw:50}]};
let checked=0,complete=0,incomplete=0;
for(const profile of report.profiles){
  const signature=JSON.stringify(profile.signature);
  if(visited.has(signature))continue;
  visited.add(signature);
  const example=profile.example;
  assert.ok(example.id,'Profile lacks a representative tariff ID: '+example.file);
  const offer=findOffer(dataFor(example.file),example.id,profile.signature.type);
  assert.ok(offer,'Profile example missing: '+example.file+' / '+example.id);
  for(const probe of [base,{...base,startAt:'2026-10-06T22:00:00Z',durationMinutes:70,chargingMinutes:60,postChargeMinutes:10}]){
    const kind=offer.pricing.type;
    const result=kind==='electroverse_restrictions'
      ?sessionEngine.evaluateElectroverseOffer(offer,probe)
      :sessionEngine.evaluateCompactMinuteOffer(offer,probe)||pricing.evaluateOffer(offer,probe);
    assert.ok(result&&typeof result.complete==='boolean','No evaluator result for '+example.id);
    if(result.complete){
      assert.ok(Number.isFinite(result.totalEur)&&result.totalEur>=0,'Invalid total for '+example.id);
      const p=offer.pricing,rules=p.rules||[];
      const mandatory=p.type==='kwh'&&Number(p.pricePerKwh)>0
        ||p.type==='rules'&&rules.length===1&&rules[0].scope==='allDay'&&Number(rules[0].pricePerKwh)>0;
      if(mandatory)assert.ok(result.totalEur>0,'Positive energy price yielded zero: '+example.id);
      complete++;
    }else{
      assert.ok(result.reason,'Unexplained incomplete result: '+example.id);
      assert.notEqual(result.reason,'unsupported_pricing','Unknown pricing type: '+example.id);
      reasons.set(result.reason,(reasons.get(result.reason)||0)+1);incomplete++;
    }
    checked++;
  }
}
assert.equal(visited.size,report.unique_profile_signatures,'Profile sweep did not cover every unique signature');
console.log(JSON.stringify({profiles:visited.size,scenarios:checked,complete,incomplete,reasons:Object.fromEntries(reasons)}));
