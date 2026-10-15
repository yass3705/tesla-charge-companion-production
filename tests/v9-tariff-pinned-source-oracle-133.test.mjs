import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {independentOracle} from '../scripts/v9_tariff_oracle_133.mjs';

const dist=process.env.TCC_V9_DIST;
if(!dist)throw Error('Set TCC_V9_DIST to the immutable validated pin');
const golden=JSON.parse(fs.readFileSync(new URL('./golden/v9-tariff-pinned-source-oracle-133.json',import.meta.url)));
const manifest=JSON.parse(fs.readFileSync(path.join(dist,'manifest.json')));
assert.equal(manifest.snapshotId,golden.snapshotId);
const fxBytes=fs.readFileSync(path.join(dist,golden.fxSource.path));
assert.equal(crypto.createHash('sha256').update(fxBytes).digest('hex'),golden.fxSource.sha256);
const fx=JSON.parse(fxBytes);
assert.equal(fx.date,golden.fxSource.date);
assert.equal(fx.base,golden.fxSource.base);
function sourceNode(testCase){
  const file=path.resolve(dist,testCase.sourcePath);
  assert(file.startsWith(path.resolve(dist)+path.sep));
  const bytes=fs.readFileSync(file);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),testCase.sourceSha256);
  const data=JSON.parse((file.endsWith('.gz')?zlib.gunzipSync(bytes):bytes).toString('utf8'));
  let node=data;
  const tokens=testCase.jsonPointer.startsWith('/')?
    testCase.jsonPointer.slice(1).split('/').map(x=>x.replace(/~1/g,'/').replace(/~0/g,'~')):
    testCase.jsonPointer.split(':');
  for(const token of tokens)node=node[token];
  return node;
}
for(const testCase of golden.cases){
  const raw=sourceNode(testCase);
  const offer=testCase.adapter==='profileRules'?{
    id:raw.profileId,currency:raw.currency,pricing:{type:'rules',timeZone:testCase.timeZone,rules:raw.rules}
  }:testCase.adapter==='teslaPricing'?{
    id:'tesla-direct:main',currency:raw.rules?.[0]?.currency,pricing:raw
  }:testCase.adapter==='ocpiTariff'?{
    id:raw.id,currency:raw.currency,pricing:{type:'ocpi',timeZone:testCase.timeZone,tariff:raw}
  }:testCase.adapter==='pricingLeaf'?{
    id:raw.id,currency:testCase.currency,pricing:raw.pricing||raw
  }:raw;
  const actual=independentOracle(offer,testCase.session,testCase.context||{});
  assert.equal(actual.status,testCase.expected.status,testCase.key);
  if(actual.status==='priced'){
    assert.equal(actual.total,testCase.expected.total,testCase.key);
    assert.equal(actual.currency,testCase.expected.currency,testCase.key);
    assert.deepEqual(actual.components,testCase.expected.components,testCase.key);
    if(testCase.expected.fxStatus){
      assert.equal(actual.convertedTotal,testCase.expected.convertedTotal,testCase.key);
      assert.equal(actual.fxStatus,testCase.expected.fxStatus,testCase.key);
      assert.equal(actual.fxAsOf,testCase.expected.fxAsOf,testCase.key);
    }
  }else assert.equal(actual.reason,testCase.expected.reason,testCase.key);
}
assert(golden.cases.some(x=>x.key==='FR-Bois-d-Arcy'));
assert(golden.cases.some(x=>x.key==='FR-Lully-DST'));
assert(golden.cases.some(x=>x.key==='GB-Midhope'));
assert(golden.cases.some(x=>x.key==='Tesla-Mac'));
console.log(`Pinned independent source oracle #133: ${golden.cases.length} cases`);
