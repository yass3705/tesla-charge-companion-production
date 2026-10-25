import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const adapter=require('../runtime-overrides/assets/v9/adapters/belgium-nap.js');

const energy={rateId:'official-rate-1',ratePolicy:'adHoc',currency:'EUR',priceType:'pricePerKWh',
  value:0.35,taxIncluded:false,taxRate:21};
const location=prices=>({id:'nap-site-1',operator:'Example CPO',latitude:50.85,longitude:4.35,
  stations:[{evses:[{id:'BE*EXA*E1',currentType:'ac',
    connectors:[{type:'iec62196T2',maxPowerW:22000},{type:'chademo',maxPowerW:50000}],prices}]}]});

const accepted=adapter.normalizeLocation(location([energy]));
assert.equal(accepted.evses.length,1);
assert.deepEqual(accepted.evses[0].connectors.map(c=>[c.kind,c.powerKw]),[['AC',22]]);
assert.equal(accepted.offers.length,1);
assert.equal(accepted.offers[0].evseIds[0],'BE*EXA*E1');
assert.equal(accepted.offers[0].currency,'EUR');
assert.equal(accepted.offers[0].pricing.rules[0].pricePerKwh,0.4235);

for(const prices of [
  [{...energy,taxIncluded:true}],
  [{...energy,taxRate:0.21}],
  [{...energy,currency:'USD'}],
  [{...energy,priceType:'pricePerMinute'}],
  [{...energy,ratePolicy:'contract'}],
  [energy,{...energy,priceType:'flatRate',value:1}],
  [energy,{...energy,priceType:'pricePerMinute',value:0.02}],
  [{...energy,value:null}],
]){
  const result=adapter.normalizeLocation(location(prices));
  assert.equal(result.evses.length,1,'supported connector must remain visible');
  assert.equal(result.offers.length,0,JSON.stringify(prices));
}
assert.equal(adapter.normalizeLocation(location([])).offers.length,0);
if(process.argv[2]){
  const pages=path.resolve(process.argv[2]);
  let sites=0,evses=0,offers=0;
  const files=fs.readdirSync(pages).filter(name=>name.endsWith('.json.gz'));
  assert.ok(files.length,'Belgium NAP page directory has no archive files');
  for(const file of files){
    const raw=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(pages,file))));
    for(const loc of (Array.isArray(raw)?raw:raw.locations||[])){
      const normalized=adapter.normalizeLocation(loc);
      assert.ok(normalized,'NAP location identity missing');
      sites++;evses+=normalized.evses.length;offers+=normalized.offers.length;
      assert.ok(normalized.offers.every(o=>o.currency==='EUR'&&o.pricing.rules.length===1&&
        o.pricing.rules[0].chargePerMinute===0&&o.pricing.rules[0].connectionFee===0));
    }
  }
  console.log('Belgium NAP pinned source:',{sites,evses,offers});
}
console.log('Belgium NAP VAT, connector scope and unsupported fee guards: PASS');
