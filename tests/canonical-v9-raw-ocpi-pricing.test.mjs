import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import {createHash,webcrypto} from 'node:crypto';
const require=createRequire(import.meta.url);
const uk=require('../runtime-overrides/assets/v9/adapters/uk-open-feeds.js');
globalThis.TCCV9Adapters={ukOpenFeeds:uk};
const canonical=require('../runtime-owned/assets/v9/adapters/canonical-v9.js');
const pricing=require('../runtime-overrides/assets/v9/pricing-engine.js');
const tariff={country_code:'GB',party_id:'GRD',id:'T1',currency:'GBP',type:null,
 min_price:null,max_price:null,start_date_time:null,end_date_time:null,
 elements:[{restrictions:null,price_components:[{type:'ENERGY',price:0.4916,vat:20,step_size:1}]}]};
const data={schemaVersion:1,source:{id:'GB:gridserve_pcpr_direct',artifactSha256:'a'.repeat(64),
 rawMetadata:{tariffArtifactSha256:'b'.repeat(64),scopeValidation:{scope:'historical_public_exact_connector',method:'uk_gridserve_v9_prepare.build'}}},
 cpos:[{id:'cpo',sourceOperatorId:'GRD'}],stations:[{id:'st',cpoId:'cpo',country:'GB',name:'Fixture',
  latitude:51.5,longitude:-.1,rawSourceFields:{publish:true,party_id:'GRD'}}],
 evses:[{id:'evse',cpoId:'cpo',stationId:'st',officialEvseId:null,sourceEvseId:'uid'}],
 connectors:[{id:'c',evseId:'evse',powerKw:50,sourceConnectorId:'1',unresolvedTariffRefs:[],
  rawSourceFields:{power_type:'DC',tariff_ids:['T1'],sourceTariffIds:['T1']}}],
 tariffCatalog:{T1:tariff},offers:[{id:'o',channel:'Direct',scope:{evseId:'evse',connectorId:'c'},
  sourceTariffKey:'T1',rawOffer:tariff,calculationStatus:'not_evaluated'}]};
const session={startAt:'2026-11-14T12:00:00Z',energyKwh:10.0001,chargingMinutes:30,durationMinutes:30,postChargeMinutes:0};
const fragment=canonical.toFragments(data)[0];assert.equal(fragment.offers.length,1);
const quote=pricing.evaluateOffer(fragment.offers[0],session);
assert.equal(quote.complete,true);
// Independent integer-unit oracle: 10001 Wh, 4916/10000 GBP/kWh net, explicit 20% VAT.
assert.equal(quote.totalEur,5.89979,'integer-unit oracle 5.89978992 rounded to six decimals by the existing engine');
assert.deepEqual(fragment.offers[0].connectorIds,['c']);assert.equal(fragment.evses[0].officialEvseId,null);
assert.equal(pricing.evaluateOffer(fragment.offers[0],{...session,energyKwh:null}).complete,false);
const changes=[
 x=>delete x.source.rawMetadata.scopeValidation,
 x=>x.connectors[0].powerKw=null,
 x=>x.connectors[0].rawSourceFields.sourceTariffIds.push('missing'),
 x=>x.offers[0].calculationHold='unknown_condition',
 x=>x.offers[0].scope.connectorId='other',
 x=>x.offers[0].rawOffer.party_id='OTHER',
 x=>x.offers[0].rawOffer.currency='EUR',
 x=>x.offers[0].rawOffer.min_price={incl_vat:1},
 x=>x.offers[0].rawOffer.start_date_time='2026-11-15T00:00:00Z',
 x=>x.offers[0].rawOffer.new_fee=3,
 x=>delete x.offers[0].rawOffer.elements[0].price_components[0].vat,
 x=>x.offers[0].rawOffer.elements[0].price_components[0].vat=0.2,
 x=>x.offers[0].rawOffer.elements[0].price_components[0].step_size=0,
 x=>x.offers[0].rawOffer.elements[0].price_components[0].type='UNKNOWN',
 x=>x.offers[0].rawOffer.elements[0].price_components.push({type:'FLAT',price:2,vat:20,step_size:1}),
 x=>x.offers[0].rawOffer.elements[0].restrictions={min_duration:100},
 x=>x.offers[0].rawOffer.elements[0].restrictions=false,
];
for(const change of changes){const x=structuredClone(data);change(x);const f=canonical.toFragments(x)[0];assert.equal(f.offers.length,0);assert.equal(f.unparsedOffers.length,1);}
if(process.argv[2]){
 const doc=JSON.parse(fs.readFileSync(process.argv[2]));const rows=canonical.toFragments(doc);
 let interpreted=0,complete=0,raw=0;
 for(const row of rows){raw+=row.unparsedOffers.length;for(const offer of row.offers){interpreted++;assert.equal(offer.currency,'GBP');const q=pricing.evaluateOffer(offer,session);if(q.complete)complete++;}}
 const shown=new Set(rows.map(r=>r.canonicalId)),excluded=doc.stations.filter(s=>!shown.has(s.id));
 assert.ok(excluded.every(s=>s.rawSourceFields?.parking_type==='PARKING_GARAGE'),'only established garage exclusion may hide a validated public station');
 const hiddenEvses=new Set(doc.evses.filter(e=>excluded.some(s=>s.id===e.stationId)).map(e=>e.id));
 const excludedOffers=doc.offers.filter(o=>hiddenEvses.has(o.scope.evseId)).length;
 console.log(JSON.stringify({source:doc.source.id,stations:rows.length,canonicalOffers:doc.offers.length,interpreted,complete,raw,excludedStations:excluded.map(s=>s.sourceStationId),excludedOffers}));
 assert.equal(interpreted+raw+excludedOffers,doc.offers.length);
}
console.log('Raw UK OCPI: exact scope, explicit VAT and independent arithmetic oracle PASS');

const {loadPrepared}=require('../runtime-owned/assets/v9/preproduction-candidate-loader.js');
const encoded=JSON.stringify(data),index={schemaVersion:1,bundleId:'a'.repeat(64),status:'prepared',rejected:[],
 sources:[{source:data.source.id,path:'sources/GB__gridserve_pcpr_direct.json',sha256:createHash('sha256').update(encoded).digest('hex')}]};
const config={baseUrl:'http://localhost/prepared/',origin:'http://localhost/',adapter:canonical,cryptoImpl:webcrypto,
 fetchImpl:async url=>new Response(url.endsWith('index.json')?JSON.stringify(index):encoded)};
const loaded=await loadPrepared(config);
assert.equal((await loaded.loaders['prepared:'+data.source.id]({}))[0].offers.length,1);
const mutant={...canonical,toFragments:d=>{const rows=canonical.toFragments(d);rows[0].offers[0].pricing.componentGroups[0].rules[0].pricePerKwh=0.01;return rows;}};
const guarded=await loadPrepared({...config,adapter:mutant});
await assert.rejects(()=>guarded.loaders['prepared:'+data.source.id]({}));
