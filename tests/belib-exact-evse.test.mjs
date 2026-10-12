import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync,copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const require=createRequire(import.meta.url);
const stable=process.env.TCC_STABLE_ROOT;
if(stable){
  const adapter=require(join(stable,'v9-production-runtime/assets/v9/adapters/direct-offers.js'));
  const engine=require(join(stable,'v9-production-runtime/assets/v9/data-engine.js'));
  const datalab=process.env.TCC_DATALAB_ROOT;
  assert.ok(datalab,'TCC_DATALAB_ROOT required');
  const directory=mkdtempSync(join(tmpdir(),'tcc-belib-'));
  try{
    const path=join(directory,'offers.json');
    copyFileSync(join(stable,'v9-production-runtime/data/v9/france-belib-offers.json'),path);
    execFileSync('python3',['scripts/scope_belib_offers.py',path,join(datalab,'data/national/belib_stations_paris.json')]);
    const offers=adapter.normalizePayload(JSON.parse(readFileSync(path))).offerRules;
    assert.equal(offers.length,new Set(offers.map(offer=>offer.id)).size);
    const station={id:'FR:national:FRV75PPX0201',countryCode:'FR',physicalOperator:{name:'TotalEnergies'},networkBrand:'TotalEnergies',evses:[{id:'cfg',pdcIds:['FRV75EPX02011'],connectors:[{kind:'AC',powerKw:7}]}]};
    const matching=offers.filter(offer=>engine.ruleMatchesStation(offer,station));
    assert.deepEqual(matching.map(offer=>offer.subscriptionId).sort(),[null,'belib-nonresident','belib-resident'].sort());
    assert.ok(offers.every(offer=>offer.metadata?.verifiedScope==='exact_evse'));
    assert.equal(offers.filter(offer=>engine.ruleMatchesStation(offer,{...station,evses:[{...station.evses[0],pdcIds:['UNRELATED']}]})).length,0);
  }finally{rmSync(directory,{recursive:true,force:true});}
}
console.log('Belib exact EVSE scope checks OK');
