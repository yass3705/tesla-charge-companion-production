import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';

const dist=process.env.TCC_V9_DIST;
if(!dist)throw Error('Set TCC_V9_DIST to the validated pinned dist');
const output=path.join(os.tmpdir(),`tcc133-dualrun-${process.pid}.json`);
try{
  execFileSync(process.execPath,[new URL('../scripts/v9_tariff_dualrun_133.mjs',import.meta.url).pathname,dist,output],
    {stdio:'pipe',timeout:180000});
  const actual=JSON.parse(fs.readFileSync(output));
  const golden=JSON.parse(fs.readFileSync(new URL('./golden/v9-tariff-dualrun-133.json',import.meta.url)));
  assert.equal(actual.summary.snapshotId,golden.snapshotId);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(dist,'manifest.json'))).digest('hex'),golden.manifestSha256);
  assert.deepEqual(actual.rows.map(r=>({key:r.key,stationId:r.stationId||null,evseId:r.evseId||null,
    connectorId:r.connectorId||null,offerId:r.offerId||null,status:r.new?.status||r.status,
    total:r.new?.total??null,currency:r.new?.currency??null,classification:r.classification||null})),
    golden.scenarios.map(({rawKey,sourceSha256,...expected})=>expected));
  assert(golden.scenarios.every(r=>!r.sourceSha256||/^[a-f0-9]{64}$/.test(r.sourceSha256)));
  assert.equal(new Set(actual.rows.map(r=>r.key)).size,13);
  assert(actual.rows.some(r=>r.key==='FR-bois-d-arcy'&&r.offerId?.startsWith('electra-platform:')));
}finally{if(fs.existsSync(output))fs.unlinkSync(output)}
console.log('V9 pinned dist dual-run #133 golden OK');
