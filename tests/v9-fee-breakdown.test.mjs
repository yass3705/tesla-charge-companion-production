import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const shell=require('../v9-production-shell/bridge.js');
const pricing=require('../runtime-overrides/assets/v9/pricing-engine.js');

const components={energy:10,chargingTime:2,connectionFee:1,
  parkingTime:{costGbp:3},idleSupplement:{costGbp:4},
  congestionTime:{totalEur:5},conditionalSessionFees:{costEur:6},
  postCharge:{costEur:7},minimumTotal:{topUpEur:1},
  guestPreAuthorisation:{amountGbp:25,includedInTotal:false}};
const rows=shell.feeBreakdown(components);
assert.deepEqual(rows.map(row=>row.amount),[10,2,1,3,4,7,6,5,1]);
assert.equal(rows.some(row=>row.amount===25),false,'preauthorisation is never a billed fee');
assert.equal(shell.feeBreakdown(components,true).some(row=>row.key==='congestionTime'),false,
  'a disabled congestion charge must disappear from the displayed fees');
assert.deepEqual(shell.feeBreakdown({componentGroups:[{costEur:2},{costEur:3}],
  minimumTotal:{topUpEur:1}}).map(row=>row.amount),[1,2,3],
  'group charges remain visible alongside a minimum top-up');
assert.deepEqual(shell.feeBreakdown({segmentedPricing:{totalEur:4},
  minimumTotal:{topUpEur:1}}).map(row=>row.amount),[1,4],
  'time-window charges remain visible alongside a minimum top-up');

const source=JSON.parse(zlib.gunzipSync(fs.readFileSync(
  new URL('./fixtures/v9-tariff-133/midhope-source.json.gz',import.meta.url))));
const scenarios=JSON.parse(fs.readFileSync(new URL('./fixtures/v9-tariff-133/midhope-scenarios.json',import.meta.url)));
const golden=JSON.parse(fs.readFileSync(new URL('./golden/v9-tariff-133/midhope-source.json',import.meta.url)));
const spec=scenarios.scenarios.find(row=>golden.branchExpected[row.key.slice('GB-Midhope-P7-'.length)]?.status==='priced');
assert.ok(spec,'historical priced scenario required');
const offer=source.sources[0].locations[0].evses[0].connectors[0].validatedV9Offer;
const result=pricing.evaluateOffer(offer,{...scenarios.session,...spec.session});
assert.equal(result.complete,true);
const actual=shell.feeBreakdown(result.components);
const expected=golden.branchExpected[spec.key.slice('GB-Midhope-P7-'.length)].components;
assert.equal(actual.find(row=>row.key==='energy')?.amount,expected.energy);
assert.equal(actual.find(row=>row.key==='parkingTime')?.amount,expected.parkingTime);
assert.equal(actual.find(row=>row.key==='idleSupplement')?.amount,expected.idleSupplement);
assert.equal(actual.some(row=>row.key==='guestPreAuthorisation'),false);
const item={offerId:'historical-offer',provider:'Direct',kind:'direct',currency:'GBP',targetCurrency:'GBP',
  total:result.totalEur,comparable:true,result};
const markup=shell.renderTariffs({best:item,alternatives:[],incomplete:[]},
  {id:'station',evses:[],offers:[{id:'historical-offer',provider:'Direct',currency:'GBP',pricing:offer.pricing}]});
assert.match(markup,/Stationnement :/);
assert.match(markup,/Supplément après charge :/);
assert.match(markup,/Préautorisation non facturée : 25,00 GBP/);
assert.match(markup,/Prix non disponible/);
console.log('V9 fee breakdown: full charges visible, preauthorisation separate');
