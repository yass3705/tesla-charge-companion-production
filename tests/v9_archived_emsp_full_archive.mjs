import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),adapter=require('../runtime-owned/assets/v9/adapters/canonical-v9.js'),engine=require('../runtime-overrides/assets/v9/pricing-engine.js');
const old=path.resolve(process.argv[2]),next=path.resolve(process.argv[3]),session={energyKwh:10,durationMinutes:40,chargingMinutes:30,postChargeMinutes:10,startAt:'2026-10-15T12:00:00Z',powerKw:22,startSocPercent:20,targetSocPercent:80};
const report={status:'pass',session,sources:{}};
for(const source of ['FR:emsp_exact','FR:electra_emsp_exact']){
 const filename=source.replace(':','__')+'.json',a=JSON.parse(fs.readFileSync(path.join(old,filename))),b=JSON.parse(fs.readFileSync(path.join(next,filename)));
 const before=adapter.toFragments(a).flatMap(s=>s.offers),stations=adapter.toFragments(b),offers=stations.flatMap(s=>s.offers),raw=stations.flatMap(s=>s.unparsedOffers);
 const byEvse=new Map(offers.map(o=>[o.evseIds[0],o])),byId=new Map(offers.map(o=>[o.id,o]));let previousComplete=0,changedHistoricalInputs=0,complete=0,arithmetic=0;const reasons={};
 const oldRaw=new Map(a.offers.map(o=>[o.id,o])),newRaw=new Map(b.offers.map(o=>[o.id,o]));
 const cohorts=d=>{const m=new Map();for(const o of d.offers){const k=o.scope.evseId,rows=m.get(k)||[];rows.push(JSON.stringify({scope:o.scope,raw:o.rawOffer}));m.set(k,rows);}return new Map([...m].map(([k,v])=>[k,JSON.stringify(v.sort())]));};
 const oldCohorts=cohorts(a),newCohorts=cohorts(b);
 for(const o of before){if(process.argv.includes('--renewed')&&(JSON.stringify(oldRaw.get(o.id)?.rawOffer)!==JSON.stringify(newRaw.get(o.id)?.rawOffer)||oldCohorts.get(o.evseIds[0])!==newCohorts.get(o.evseIds[0]))){changedHistoricalInputs++;continue;}const expected=engine.evaluateOffer(o,session);if(!expected.complete)continue;previousComplete++;
  const preserved=byId.get(o.id)||byEvse.get(o.evseIds[0]);assert.ok(preserved,'Previously proved offer scope lost '+o.evseIds[0]);
  const actual=engine.evaluateOffer(preserved,session);assert.equal(actual.complete,true);assert.ok(Math.abs(actual.totalEur-expected.totalEur)<1e-8,'Previously proved amount changed');
 }
 for(const s of stations)for(const o of s.offers){
  assert.ok(o.evseIds.every(id=>s.evses.some(e=>e.id===id)));assert.ok(o.connectorIds.every(id=>s.evses.some(e=>o.evseIds.includes(e.id)&&e.connectors.some(c=>c.id===id))));
  const q=engine.evaluateOffer(o,session);
  if(q.complete){assert.ok(Number.isFinite(q.totalEur)&&q.totalEur>=0);complete++;}else reasons[q.reason]=(reasons[q.reason]||0)+1;
  const rules=o.pricing.rules;
  if(rules.length===1){const r=rules[0];
   if(r.scope==='allDay'&&!r.days&&!r.ocpiDurationBands?.length&&!r.ocpiCongestionDurationBands?.length&&!r.afterMinutesRate&&!r.congestionTimePerMinute&&!r.electraCongestionPolicy&&r.billing==='kwh'&&q.complete){
    const expected=10*r.pricePerKwh+30*r.chargePerMinute+10*r.idlePerMinute+r.connectionFee;
    assert.ok(Math.abs(q.totalEur-expected)<1e-6,'Independent combined arithmetic differs');arithmetic++;
   }
  }
 }
 assert.ok(raw.every(o=>o.calculationStatus==='not_evaluated'));
 report.sources[source]={canonicalOffers:b.offers.length,engineOffers:offers.length,rawOffers:raw.length,complete,independentArithmetic:arithmetic,previousCompletePreserved:previousComplete,changedHistoricalInputs,incompleteReasons:reasons};
}
console.log(JSON.stringify(report,null,2));
