import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {toFragments}=require('../runtime-owned/assets/v9/adapters/canonical-v9.js');
const {resolveEntities}=require('../runtime-owned/assets/v9/data-engine.js');
const {variantsByPower,stationCards,renderStationCard}=require('../v9-production-shell/bridge.js');
const canonical={schemaVersion:1,source:{id:'DE:bnetza_afir_archive',artifactSha256:'a'.repeat(64)},
 cpos:[{id:'operator',sourceOperatorId:'Fixture',name:'Fixture'}],
 stations:[{id:'national-site',country:'DE',cpoId:'operator',sourceStationId:'bnetza-site:fixture',
 latitude:52.5,longitude:13.4,address:{street:'Fixture Straße',houseNumber:'12',city:'Berlin'},rawSourceFields:{maxConnectionPowerKw:150,pricing:{stagingEffectiveEurPerKwh:999}}}],
 evses:[{id:'national-evse',stationId:'national-site',sourceEvseId:'DE*FIX*E1',officialEvseId:'DE*FIX*E1'}],connectors:[],offers:[]};
const fragment=toFragments(canonical)[0];
assert.equal(fragment.name,'Fixture Straße 12 Berlin','unnamed sites use their archived address for display');
assert.equal(fragment.evses[0].officialEvseId,'DE*FIX*E1');
assert.deepEqual(fragment.evses[0].connectors,[],'site maximum must not become a connector power');
assert.deepEqual(fragment.offers,[],'staging price must not become a calculable tariff');
const entities=resolveEntities([{source:{id:'prepared:DE:bnetza_afir_archive'},fragment},
 {source:{id:'separate-cpo'},fragment:{...fragment,canonicalId:'separate-site',sourceStationId:'separate',evses:[]}}]);
assert.equal(entities.length,2,'coincident coordinates alone do not authorize an identity/tariff join');
const unknown=variantsByPower({TCCV9SessionPlannerEngine:{planStation(){}},
 TCCV9SessionEngine:{evaluateStation(){},offerMatchesChargingKind(){}},
 TCCV9StationScoreEngine:{scoreStation(){}}},[{station:entities[0]}],{});
assert.equal(unknown.length,1,'station without connector topology stays accessible');
assert.equal(unknown[0].total,null);
assert.equal(unknown[0].powerLine.count,entities[0].evses.length,'known EVSEs without connector power remain counted');
if(process.argv[2]){
 const real=JSON.parse(readFileSync(process.argv[2],'utf8')),fragments=toFragments(real);
 assert.equal(fragments.length,real.stations.length);
 assert.equal(fragments.reduce((n,st)=>n+st.evses.length,0),real.evses.length);
 assert.ok(fragments.every(st=>!st.offers.length&&st.evses.every(evse=>!evse.connectors.length)));
 console.log(JSON.stringify({stations:fragments.length,evses:real.evses.length,calculatedOffers:0}));
}
console.log('German national archive identity, no inferred connector/price, no proximity join PASS');

const mixed={...fragment,id:'mixed',evses:[...fragment.evses,{id:'known-evse',connectors:[{id:'known-plug',kind:'AC',powerKw:22}]}]};
const mixedVariants=variantsByPower({TCCV9SessionPlannerEngine:{planStation:(_st,s)=>({effectiveSession:s})},
 TCCV9SessionEngine:{evaluateStation:()=>({best:null,alternatives:[],incomplete:[]}),offerMatchesChargingKind:()=>true},
 TCCV9StationScoreEngine:{scoreStation:()=>({})}},[{station:mixed}],{});
assert.deepEqual(mixedVariants.flatMap(v=>v.station.evses.map(e=>e.id)).sort(),['known-evse','national-evse']);
assert.equal(mixedVariants.find(v=>v.powerLine.kind==='UNKNOWN').powerLine.count,1);
console.log('Mixed known/unknown connector topology retains every source EVSE PASS');

const empty=variantsByPower({TCCV9SessionPlannerEngine:{planStation(){}},TCCV9SessionEngine:{evaluateStation(){},offerMatchesChargingKind(){}},TCCV9StationScoreEngine:{scoreStation(){}}},[{station:{...mixed,id:'empty',evses:[]}}],{});
const emptyHtml=renderStationCard(stationCards(empty)[0],0,{});
assert.match(emptyHtml,/Nombre de PDC non renseigné/);
assert.doesNotMatch(emptyHtml,/· 0 PDC|UNKNOWN null kW/);
assert.doesNotMatch(renderStationCard(stationCards(unknown)[0],0,{}),/UNKNOWN null kW/);
console.log('Unknown topology is never displayed as zero physical points PASS');
