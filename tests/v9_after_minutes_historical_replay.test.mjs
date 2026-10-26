import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {runInNewContext} from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),context={};
runInNewContext(fs.readFileSync('runtime-overrides/assets/v9/pricing-engine.js','utf8'),context);
const pricing=process.argv[3]?require(path.resolve(process.argv[3],'runtime/assets/v9/pricing-engine.js')):context.TCCV9PricingEngine;
const root=path.resolve(process.argv[2]||'../tesla-charge-companion-data-lab-v9-rebuild');
const report={fixtures:[],offers:0,evaluations:0,incorrectlyCalculated:[]};
for(const file of ['reports/tariff-scenarios/france-real-offer-fixtures.json','reports/tariff-scenarios/france-runtime-offer-fixtures.json']){
  const raw=fs.readFileSync(path.join(root,file));
  report.fixtures.push({file,sha256:crypto.createHash('sha256').update(raw).digest('hex')});
  for(const {offer} of JSON.parse(raw)){
    if(!(offer?.pricing?.rules||[]).some(rule=>Number(rule.afterMinutesRate)>0))continue;
    report.offers++;
    const before=JSON.stringify(offer);
    for(const durationMinutes of [50,60,61,90,120,180,300]){
      const chargingMinutes=Math.min(75,durationMinutes);
      const result=pricing.evaluateOffer(offer,{energyKwh:25,durationMinutes,chargingMinutes,
        totalChargingMinutes:chargingMinutes,postChargeMinutes:durationMinutes-chargingMinutes,
        startAt:'2026-10-11T13:00:00+02:00',timeZone:'Europe/Paris',powerKw:22});
      report.evaluations++;
      if(result.complete)report.incorrectlyCalculated.push({id:offer.id,durationMinutes,total:result.totalEur});
    }
    assert.equal(JSON.stringify(offer),before,'historical input must remain unchanged');
  }
}
assert.ok(report.offers>0,'the archived mechanism fixture must be exercised');
assert.deepEqual(report.incorrectlyCalculated,[],'unproved fee semantics cannot produce a partial price');
console.log(JSON.stringify(report));
