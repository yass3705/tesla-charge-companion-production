import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
const dist=process.env.TCC_V9_DIST;
if(!dist)throw Error('TCC_V9_DIST required');
const golden=JSON.parse(fs.readFileSync(new URL('./golden/v9-tariff-phase6-source-133.json',import.meta.url)));
const manifest=JSON.parse(fs.readFileSync(path.join(dist,'manifest.json')));
test('Phase 6 residual refusal source bytes and semantics are pinned',()=>{
  assert.equal(golden.snapshotId,manifest.snapshotId);
  for(const c of golden.cases){
    const bytes=fs.readFileSync(path.join(dist,c.path));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),c.sha256,c.path);
    assert.equal(manifest.files.find(f=>f.path===c.path)?.sha256,c.sha256,c.path);
    let value=JSON.parse(c.path.endsWith('.gz')?zlib.gunzipSync(bytes):bytes);
    for(const token of c.pointer.slice(1).split('/'))value=value[token];
    assert.deepEqual(value,c.expected,`${c.country} ${c.pointer}`);
  }
});
