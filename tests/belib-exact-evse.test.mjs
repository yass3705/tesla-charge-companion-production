import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync,copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runInNewContext} from 'node:vm';

const require=createRequire(import.meta.url);
const context={TCCV9OfferEngine:{eligibleOffers:station=>station.offers||[]},TCCV9PricingEngine:require('../runtime-overrides/assets/v9/pricing-engine.js')};
runInNewContext(readFileSync(new URL('../runtime-overrides/assets/v9/session-engine.js',import.meta.url),'utf8'),context);
const sessionEngine=context.TCCV9SessionEngine;
const stable=process.env.TCC_STABLE_ROOT;
if(stable){
  const adapter=require(resolve(stable,'v9-production-runtime/assets/v9/adapters/direct-offers.js'));
  const engine=require(resolve(stable,'v9-production-runtime/assets/v9/data-engine.js'));
  const datalab=process.env.TCC_DATALAB_ROOT;
  assert.ok(datalab,'TCC_DATALAB_ROOT required');
  const directory=mkdtempSync(join(tmpdir(),'tcc-belib-'));
  try{
    const path=join(directory,'offers.json');
    copyFileSync(resolve(stable,'v9-production-runtime/data/v9/france-belib-offers.json'),path);
    execFileSync('python3',[resolve(dirname(fileURLToPath(import.meta.url)),'../scripts/scope_belib_offers.py'),path,resolve(datalab,'data/national/belib_stations_paris.json')]);
    const offers=adapter.normalizePayload(JSON.parse(readFileSync(path))).offerRules;
    assert.equal(offers.length,new Set(offers.map(offer=>offer.id)).size);
    const station={id:'FR:national:FRV75PPX0201',countryCode:'FR',physicalOperator:{name:'TotalEnergies'},networkBrand:'TotalEnergies',evses:[{id:'cfg',pdcIds:['FRV75EPX02011'],connectors:[{kind:'AC',powerKw:7}]}]};
    const matching=offers.filter(offer=>engine.ruleMatchesStation(offer,station));
    assert.deepEqual(matching.map(offer=>offer.subscriptionId).sort(),[null,'belib-nonresident','belib-resident'].sort());
    assert.ok(offers.every(offer=>offer.metadata?.verifiedScope==='exact_evse'));
    assert.equal(offers.filter(offer=>engine.ruleMatchesStation(offer,{...station,evses:[{...station.evses[0],pdcIds:['UNRELATED']}]})).length,0);
  }finally{rmSync(directory,{recursive:true,force:true});}
}
const scopedOffer={id:'belib-exact-ac',kind:'direct',provider:'Belib',currency:'EUR',evseIds:['FRV75E-SCOPED'],connectorKinds:['AC'],pricing:{type:'rules',rules:[{scope:'allDay',pricePerKwh:.3}]}};
const stationWithScope={id:'belib-mixed',countryCode:'FR',evses:[
  {id:'configuration-7',pdcIds:['FRV75E-SCOPED'],connectors:[{id:'ac-7',kind:'AC',powerKw:7}]},
  {id:'configuration-22',pdcIds:['FRV75E-OTHER'],connectors:[{id:'ac-22',kind:'AC',powerKw:22}]}
],offers:[scopedOffer]};
const quoted=sessionEngine.evaluateStation(stationWithScope,{energyKwh:5,durationMinutes:60,targetCurrency:'EUR'});
assert.equal(quoted.best?.offerId,scopedOffer.id);
assert.equal(quoted.best?.connectorId,'ac-7');
assert.equal(quoted.best?.connectorPowerKw,7);
assert.equal(quoted.best?.total,1.5);
const unrelated={...stationWithScope,evses:stationWithScope.evses.slice(1)};
assert.equal(sessionEngine.evaluateStation(unrelated,{energyKwh:5,durationMinutes:60,targetCurrency:'EUR'}).eligibleOfferCount,0);
console.log('Belib exact EVSE scope checks OK');
