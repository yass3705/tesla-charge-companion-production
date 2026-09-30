import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);

const de=require('../runtime-overrides/assets/v9/adapters/germany-national.js');
const uk=require('../runtime-overrides/assets/v9/adapters/uk-open-feeds.js');
const avia=require('../runtime-overrides/assets/v9/adapters/switzerland-avia.js');

// Germany: inventory remains visible, but non-production-rankable pricing is never exposed.
{
  const row=de.normalizeSite({
    id:'de-test-1',countryCode:'DE',operator:'Example CPO',
    coordinates:{latitude:50.1,longitude:8.6},
    address:{street:'Teststrasse',houseNumber:'1',postalCode:'60000',city:'Frankfurt'},
    evseIds:['DE*EXA*E1'],maxConnectionPowerKw:150,
    service:{state:'operational'},
    pricing:{stagingPreferredTariff:{productionRankable:false,eurPerKwh:0.49}}
  });
  assert.ok(row);
  assert.equal(row.status.state,'available');
  assert.equal(row.offers.length,0);
  assert.equal(row.legacy.pricingFailClosed,true);
}

// Germany: a deliberately simple tariff explicitly marked production-rankable is exposed.
{
  const row=de.normalizeSite({
    id:'de-test-2',countryCode:'DE',operator:'Example CPO',
    coordinates:{latitude:50.2,longitude:8.7},
    evseIds:['DE*EXA*E2'],maxConnectionPowerKw:50,
    service:{state:'unknown'},
    pricing:{stagingPreferredTariff:{
      productionRankable:true,selectionMode:'site_scalar',sourceType:'direct_cpo',
      provider:'Example CPO',currency:'EUR',eurPerKwh:0.52
    }}
  });
  assert.equal(row.offers.length,1);
  assert.equal(row.offers[0].pricing.rules[0].pricePerKwh,0.52);
  assert.equal(row.offers[0].currency,'EUR');
}

// UK: connector tariff_ids are joined only to exact tariff ids in the same source.
{
  const payload={sources:[{
    name:'Example UK',partyIdsExpected:['EXA'],
    tariffs:[{id:'T1',currency:'GBP',elements:[{price_components:[{type:'ENERGY',price:0.65,step_size:1}]}]}],
    locations:[{
      id:'L1',party_id:'EXA',name:'Example UK Station',
      coordinates:{latitude:'51.5',longitude:'-0.1'},
      operator:{name:'Example UK'},
      opening_times:{twentyfourseven:true},
      evses:[{uid:'1',evse_id:'GB*EXA*E1',status:'AVAILABLE',connectors:[
        {id:'C1',power_type:'DC',max_electric_power:150000,tariff_ids:['T1']},
        {id:'C2',power_type:'AC_3_PHASE',max_electric_power:22000,tariff_ids:['MISSING']}
      ]}]
    }]
  }]};
  const rows=uk.normalizePayload(payload);
  assert.equal(rows.length,1);
  assert.equal(rows[0].offers.length,1);
  assert.equal(rows[0].offers[0].metadata.tariffId,'T1');
  assert.equal(rows[0].offers[0].pricing.rules[0].pricePerKwh,0.65);
  assert.equal(rows[0].status.state,'available');
}

// UK: conditional/restricted tariff elements stay fail-closed.
{
  const pricing=uk.tariffPricing({
    id:'T2',currency:'GBP',
    elements:[{restrictions:{min_kwh:10},price_components:[{type:'ENERGY',price:0.4}]}]
  });
  assert.equal(pricing,null);
}

// UK: OCPI TIME is per hour; runtime normalizes it to per-minute.
{
  const pricing=uk.tariffPricing({
    id:'T3',currency:'GBP',
    elements:[{price_components:[{type:'TIME',price:1.2}]}]
  });
  assert.ok(pricing);
  assert.equal(pricing.rules[0].chargePerMinute,0.02);
}

// Germany IONITY: only a unique exact-coordinate/operator match with one uniform site price is attached.
{
  const baseline={sites:[
    {id:'de-ionity-1',operator:'IONITY GmbH',coordinates:{latitude:50.1,longitude:8.6},evseIds:['DE*IOY*E1'],service:{state:'unknown'},pricing:{}},
    {id:'de-other',operator:'Other CPO',coordinates:{latitude:51.0,longitude:9.0},evseIds:['DE*OTH*E1'],service:{state:'unknown'},pricing:{}}
  ]};
  const overlay={locations:[{
    uuid:'ionity-uuid-1',locationId:'100',country:'DE',cpoIdentifier:'IONITY_CPO',
    latitude:50.1,longitude:8.6,
    connectors:[
      {kind:'DC',pricePerKwhEur:0.76},
      {kind:'DC',pricePerKwhEur:0.76}
    ]
  }]};
  const joined=de.buildIonityExactOverlay(baseline,overlay);
  assert.equal(joined.diagnostics.rankable,1);
  assert.equal(joined.offers.get('de-ionity-1').pricing.rules[0].pricePerKwh,0.76);
  const rows=de.normalizePayload(baseline,{ionityPayload:overlay});
  assert.equal(rows.find(x=>x.sourceStationId==='de-ionity-1').offers.length,1);
}

// Germany IONITY: ambiguous exact coordinates fail closed instead of picking a station.
{
  const baseline={sites:[
    {id:'a',operator:'IONITY GmbH',coordinates:{latitude:50,longitude:8},pricing:{}},
    {id:'b',operator:'IONITY GmbH',coordinates:{latitude:50,longitude:8},pricing:{}}
  ]};
  const overlay={locations:[{
    uuid:'ambiguous',country:'DE',cpoIdentifier:'IONITY_CPO',latitude:50,longitude:8,
    connectors:[{kind:'DC',pricePerKwhEur:0.70}]
  }]};
  const joined=de.buildIonityExactOverlay(baseline,overlay);
  assert.equal(joined.diagnostics.rankable,0);
  assert.equal(joined.diagnostics.reasons.ambiguous_coordinate,1);
}

// Germany IONITY: mixed connector prices at one site remain fail closed without connector identity.
{
  const baseline={sites:[{id:'mixed',operator:'IONITY GmbH',coordinates:{latitude:50,longitude:8},pricing:{}}]};
  const overlay={locations:[{
    uuid:'mixed',country:'DE',cpoIdentifier:'IONITY_CPO',latitude:50,longitude:8,
    connectors:[{kind:'DC',pricePerKwhEur:0.70},{kind:'DC',pricePerKwhEur:0.80}]
  }]};
  const joined=de.buildIonityExactOverlay(baseline,overlay);
  assert.equal(joined.diagnostics.rankable,0);
  assert.equal(joined.diagnostics.reasons.mixed_site_prices,1);
}


{
  const payload={connectors:[
    {evseId:'CH*AVI*E123',connectorInternalId:'c1',connectorType:'CCS',powerKw:150,locationId:'L1',locationUuid:'U1',tariffIds:['T1'],price:{currency:'CHF',pricePerKwhInclVat:0.65,pricePerKwhExclVat:0.60,vatPercentage:8.1,tariffHasTimeBasedPrice:false}},
    {evseId:'CH*AVI*E999',connectorInternalId:'c2',connectorType:'CCS',powerKw:150,locationId:'L2',locationUuid:'U2',tariffIds:['T2'],price:{currency:'CHF',pricePerKwhInclVat:0.70,tariffHasTimeBasedPrice:true}}
  ]};
  const out=avia.normalizePayload(payload,{id:'switzerland-avia-r8',priority:{tariff:135}});
  assert.equal(out.offerRules.length,1);
  assert.equal(out.offerRules[0].provider,'AVIA VOLT direct');
  assert.equal(out.offerRules[0].currency,'CHF');
  assert.equal(out.offerRules[0].pricing.rules[0].pricePerKwh,0.65);
  assert.ok(out.offerRules[0].evseIds.includes('CH*AVI*E123'));
  assert.ok(out.offerRules[0].evseIds.includes('CHAVIE123'));
  assert.equal(out.metadata.rejected.time_based,1);
}

console.log(JSON.stringify({
  ok:true,
  germany:'fail-closed + explicit production-rankable scalar verified',
  uk:'exact tariff-id join + restricted tariff fail-closed verified',
  switzerlandAvia:'exact EVSE CHF/kWh mapping + time-based fail-closed verified'
}));
