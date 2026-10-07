import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync,copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const require=createRequire(import.meta.url);
const shell=require('../v9-production-shell/bridge.js');
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
    const station={id:'FR:national:FRV75PPX0201',countryCode:'FR',physicalOperator:{name:'TotalEnergies'},networkBrand:'TotalEnergies',evses:[{id:'cfg',pdcIds:['FRV75EPX02011'],connectors:[{kind:'AC',powerKw:7}]}]};
    const matching=offers.filter(offer=>engine.ruleMatchesStation(offer,station));
    assert.deepEqual(matching.map(offer=>offer.subscriptionId).sort(),[null,'belib-nonresident','belib-resident'].sort());
  }finally{rmSync(directory,{recursive:true,force:true});}
}
const prices=shell.renderTariffs({best:{kind:'direct',provider:'Belib',total:6,targetCurrency:'CHF',currency:'EUR'},alternatives:[{kind:'subscription',subscriptionId:'belib-nonresident',provider:'Belib abonné',total:5,targetCurrency:'CHF'},{kind:'emsp',provider:'Electra',total:7,targetCurrency:'CHF'},{kind:'emsp',provider:'Electroverse',total:8,targetCurrency:'CHF'}]}, {},{CHF:0.9});
assert.equal((prices.match(/class="v9-tariff-row/g)||[]).length,4);
assert.ok(prices.includes('6,00 CHF (≈ 6,67 €)'));
assert.ok(prices.includes('Belib abonné'));
console.log('Belib and display checks OK');
