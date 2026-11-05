import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {consolidateNational,resolveEntities,createEngine}=require('../runtime-owned/assets/v9/data-engine.js');
const {pdcEntries}=require('../v9-production-shell/bridge.js');
const national={source:{id:'prepared:FR:irve_static',priority:100},fragment:{canonicalId:'national',sourceStationId:'IRVE',countryCode:'FR',name:'National',latitude:48,longitude:2,
 evses:[{id:'n-e',officialEvseId:'FR*ABC*E1',connectors:[{id:'n-c',officialConnectorId:'1',powerKw:22}]}],offers:[]}};
const cpo={source:{id:'prepared:FR:cpo',priority:200},fragment:{canonicalId:'cpo-site',sourceStationId:'CPO',countryCode:'FR',name:'CPO',latitude:48,longitude:2,
 evses:[{id:'c-e',officialEvseId:'FR*ABC*E1',connectors:[{id:'c-c',officialConnectorId:'1',powerKw:150}]}],
 offers:[{id:'exact',kind:'direct',currency:'EUR',evseIds:['c-e'],connectorIds:['c-c'],pricing:{type:'kwh',pricePerKwh:.5}}],
 unparsedOffers:[{id:'raw',channel:'Electra',scope:{evseId:'c-e',connectorId:'c-c'},calculationStatus:'not_evaluated'}]}};
const policy={FR:'FR:irve_static'};
const consolidate=rows=>resolveEntities(consolidateNational(rows,policy).items);
assert.equal(resolveEntities(consolidateNational([national,cpo],policy,{FR:['FR*ABC*E1']}).items)[0].offers.length,0,'ambiguity outside loaded spatial shards must block enrichment');
const result=consolidate([cpo,national]);
assert.equal(result.length,1);assert.equal(result[0].id,'national');assert.equal(result[0].name,'National');
assert.deepEqual(result[0].evses,national.fragment.evses);assert.deepEqual(result[0].offers[0].evseIds,['n-e']);
assert.deepEqual(result[0].offers[0].connectorIds,['n-c']);assert.equal(result[0].unparsedOffers[0].scope.connectorId,'n-c');
const absent=structuredClone(cpo);absent.fragment.evses[0].officialEvseId='unknown';
assert.equal(consolidate([national,absent])[0].offers.length,0,'same location cannot supply a tariff');
assert.equal(consolidate([absent]).length,0,'no fallback to CPO when national is absent');
const ambiguous=structuredClone(national);ambiguous.fragment.canonicalId='national-two';ambiguous.fragment.sourceStationId='N2';
assert.equal(consolidate([national,ambiguous,cpo]).flatMap(s=>s.offers).length,0);
const noPlug=structuredClone(cpo);delete noPlug.fragment.evses[0].connectors[0].officialConnectorId;
assert.equal(consolidate([national,noPlug])[0].offers.length,0,'connector cannot match by power');
const gb=structuredClone(cpo);gb.fragment.countryCode='GB';assert.equal(consolidate([gb]).length,1);
const mixed=structuredClone(cpo);mixed.fragment.evses.push({id:'c-e2',officialEvseId:'FR*ABC*E2',connectors:[]});
mixed.fragment.offers.push({id:'second',evseIds:['c-e2']});
const n2=structuredClone(national);n2.fragment.canonicalId='n2';n2.fragment.sourceStationId='n2';n2.fragment.evses=[{id:'n-e2',officialEvseId:'FR*ABC*E2',connectors:[]}];
assert.equal(consolidate([national,n2,mixed]).length,2,'a CPO location cannot merge two national stations');
assert.equal(pdcEntries({station:{evses:national.fragment.evses}})[0].label,'FR*ABC*E1');
assert.doesNotMatch(pdcEntries({station:{evses:national.fragment.evses}})[0].label,/non fourni/);
const engine=createEngine({registry:{sources:[national.source,cpo.source],nationalCatalogues:policy},loaders:{[national.source.id]:async()=>[national.fragment],[cpo.source.id]:async()=>[cpo.fragment]}});
assert.equal((await engine.queryArea({countryCode:'FR'})).stations.length,1);
console.log('National catalogue: exact/absent/ambiguous/multiple scopes, country fallback, physical topology and EVSE labels PASS');
