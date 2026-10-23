import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash,webcrypto} from 'node:crypto';
const require=createRequire(import.meta.url);
const uk=require('../runtime-overrides/assets/v9/adapters/uk-open-feeds.js');
globalThis.TCCV9Adapters={ukOpenFeeds:uk};
const canonical=require('../runtime-owned/assets/v9/adapters/canonical-v9.js');
const {loadPrepared}=require('../runtime-owned/assets/v9/preproduction-candidate-loader.js');
const pricing=require('../runtime-overrides/assets/v9/pricing-engine.js');
const sha=raw=>createHash('sha256').update(raw).digest('hex');
const tariff={id:'GB*SGB_02',country_code:'GB',currency:'GBP',tccPriceBasis:'GBP_including_public_UK_VAT',
  tccSourcePriceBasis:'OCPI_2.2.1_excluding_VAT',elements:[{restrictions:{start_date:'2026-07-23'},
    price_components:[
      {type:'ENERGY',price:0.89004,sourcePriceExVat:0.7417,step_size:1000,
        tccVatOrigin:'fractional_source_vat_corroborated_by_official_CPO_PAYG',tccVatRateAppliedPct:20,vat:null},
      {type:'FLAT',price:0,sourcePriceExVat:0,step_size:1,
        tccVatOrigin:'fractional_source_vat_corroborated_by_official_CPO_PAYG',tccVatRateAppliedPct:20,vat:null}
    ]}]};
const data={schemaVersion:1,source:{id:'GB:source_ev_pcpr_direct',artifactSha256:'a'.repeat(64),
  generatedAt:'2026-10-19T00:00:00Z'},cpos:[{id:'cpo',sourceOperatorId:'SGB',name:'Source EV'}],
  stations:[{id:'station',country:'GB',cpoId:'cpo',sourceStationId:'location',name:'Source EV fixture',latitude:51.5,longitude:-.4}],
  evses:[{id:'evse',country:'GB',cpoId:'cpo',stationId:'station',officialEvseId:'GB*SGB*E000026*02',
    sourceEvseId:'GB*SGB*E000026*02'}],
  connectors:[{id:'plug',evseId:'evse',sourceConnectorId:'2',officialConnectorId:null,
    plugType:'IEC_62196_T2_COMBO',powerKw:150,
    rawSourceFields:{power_type:'DC',tariff_ids:['GB*SGB_02'],sourceTariffIds:['GB*SGB_02']}}],
  offers:[{id:'offer',channel:'Direct',scope:{evseId:'evse',connectorId:'plug'},sourceTariffKey:'GB*SGB_02',
    rawOffer:tariff,calculationStatus:'not_evaluated'}],tariffCatalog:{'GB*SGB_02':tariff}};
const fragments=canonical.toFragments(data);
assert.equal(fragments[0].offers.length,1);
assert.equal(fragments[0].unparsedOffers.length,0);
assert.equal(fragments[0].evses[0].connectors[0].kind,'DC');
assert.equal(fragments[0].offers[0].pricing.type,'component_groups');
const quote=pricing.evaluateOffer(fragments[0].offers[0],{
  startAt:'2026-10-23T12:00:00Z',energyKwh:10,durationMinutes:30,chargingMinutes:30,postChargeMinutes:0});
assert.equal(quote.complete,true);
assert.ok(Math.abs(quote.totalEur-8.9004)<1e-6);
assert.equal(uk.pcprDirectPricing(tariff).ocpiFirstMatch,true);
const before=pricing.evaluateOffer(fragments[0].offers[0],{
  startAt:'2026-07-22T12:00:00Z',energyKwh:10,durationMinutes:30,chargingMinutes:30});
assert.equal(before.complete,false,'a dated tariff cannot be applied before its start date');
const combined=structuredClone(data);
combined.offers[0].rawOffer.elements[0].price_components[1].price=1.2;
combined.offers[0].rawOffer.elements[0].price_components[1].sourcePriceExVat=1;
const combinedOffer=canonical.toFragments(combined)[0].offers[0];
const combinedQuote=pricing.evaluateOffer(combinedOffer,{
  startAt:'2026-10-23T12:00:00Z',energyKwh:10,durationMinutes:30,chargingMinutes:30});
assert.equal(combinedQuote.complete,true);
assert.ok(Math.abs(combinedQuote.totalEur-10.1004)<1e-6,
  'archived converter must add a fixed component to the energy charge');
function config(payload,adapter=canonical){
  const raw=JSON.stringify(payload),index={schemaVersion:1,bundleId:'a'.repeat(64),status:'prepared',rejected:[],
    sources:[{source:'GB:source_ev_pcpr_direct',path:'sources/GB__source_ev_pcpr_direct.json',sha256:sha(raw)}]};
  return{baseUrl:'http://127.0.0.1/prepared-v9/',origin:'http://127.0.0.1/shell/',adapter,
    cryptoImpl:webcrypto,fetchImpl:async url=>new Response(url.endsWith('index.json')?JSON.stringify(index):raw)};
}
const prepared=await loadPrepared(config(data));
assert.equal((await prepared.loaders['prepared:GB:source_ev_pcpr_direct']({}))[0].offers.length,1);
const mutating={toFragments:payload=>{
  const rows=canonical.toFragments(payload);
  rows[0].offers[0].pricing.componentGroups[0].rules[0].pricePerKwh=9;
  return rows;
}};
const tampered=await loadPrepared(config(data,mutating));
await assert.rejects(tampered.loaders['prepared:GB:source_ev_pcpr_direct']({}),/pricing isolation violated/);
const noPower=structuredClone(data);noPower.connectors[0].powerKw=null;
assert.equal(canonical.toFragments(noPower)[0].offers.length,0);
assert.equal(canonical.toFragments(noPower)[0].unparsedOffers.length,1);
const unknown=structuredClone(data);unknown.offers[0].rawOffer.elements[0].price_components.push({type:'CUSTOM',price:1});
assert.equal(canonical.toFragments(unknown)[0].offers.length,0);
console.log('Canonical UK PCPR exact connector pricing and mutation guard OK');
