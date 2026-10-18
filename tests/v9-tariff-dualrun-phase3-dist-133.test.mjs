import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const dist=process.env.TCC_V9_DIST;
if(!dist)throw Error('Set TCC_V9_DIST to the validated pinned dist');
const golden=JSON.parse(fs.readFileSync(new URL('./golden/v9-tariff-dualrun-phase3-133.json',import.meta.url)));
const output=path.join(os.tmpdir(),`tcc133-phase3-dualrun-${process.pid}.json`);
const project=x=>{
  const n=x.new||{},o=n.oracle||{},l=x.legacy||{};
  return{key:x.key,country:x.country,stationId:x.stationId||null,evseId:x.evseId||null,
    connectorId:x.connectorId||null,offerId:x.offerId||null,channel:x.channel||null,
    status:n.status||x.status,total:n.total??null,currency:n.currency??null,
    targetTotal:n.targetTotal??null,fxStatus:n.fxStatus||null,components:n.components||null,
    componentValues:n.componentValues||null,oracleStatus:o.status||null,oracleTotal:o.total??null,
    oracleComponents:o.components||null,oracleRawKey:o.rawKey||null,source:n.source||null,
    differences:l.differences||[],classification:x.classification||null};
};
try{
  execFileSync(process.execPath,[new URL('../scripts/v9_tariff_dualrun_133.mjs',import.meta.url).pathname,dist,output],
    {stdio:'pipe',timeout:240000});
  const actual=JSON.parse(fs.readFileSync(output));
  assert.equal(actual.summary.snapshotId,golden.snapshotId);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(dist,'manifest.json'))).digest('hex'),
    golden.manifestSha256);
  assert.deepEqual(actual.summary,golden.summary);
  assert.deepEqual(actual.rows.map(project),golden.rows);
  assert.equal(actual.rows.length,79);
  assert.equal(new Set(actual.rows.map(r=>r.key)).size,21);
}finally{if(fs.existsSync(output))fs.unlinkSync(output)}
console.log('V9 pinned Phase 3 dual-run #133 golden OK');
