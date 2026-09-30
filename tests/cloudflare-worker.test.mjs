import assert from "node:assert/strict";
import worker from "../cloudflare/src/index.js";

class Obj {
  constructor(value, type="application/json") {
    this.value = value;
    this.httpEtag = '"test-etag"';
    this.type = type;
  }
  writeHttpMetadata(headers) {
    headers.set("content-type", this.type);
  }
  async json() {
    if (typeof this.value === "string") return JSON.parse(this.value);
    return this.value;
  }
  get body() {
    const value = typeof this.value === "string" ? this.value : JSON.stringify(this.value);
    return new TextEncoder().encode(value);
  }
}

class Bucket {
  constructor(map) { this.map = map; }
  async get(key) {
    return Object.prototype.hasOwnProperty.call(this.map,key) ? new Obj(this.map[key]) : null;
  }
}

const contract = {
  schemaVersion: 1,
  snapshotId: "2026-09-30",
  datasets: {
    FR: {
      kind: "canonical-overlay",
      manifest: "runtime/data/v9/france-static/manifest.json",
      canonical: "snapshot-inputs/FR/france_public_charging_canonical.json",
      coverage: "partial"
    },
    DE: {
      kind: "national-baseline",
      manifest: "snapshot-inputs/DE/manifest.json",
      all: "snapshot-inputs/DE/all.json.gz",
      coverage: "partial"
    }
  }
};

const env = {
  TCC_DATA: new Bucket({
    "current.json": {snapshotId:"2026-09-30"},
    "snapshots/2026-09-30/runtime-contract.json": contract,
    "snapshots/2026-09-30/manifest.json": {snapshotId:"2026-09-30"},
    "snapshots/2026-09-30/snapshot-inputs/DE/manifest.json": {country:"DE"}
  })
};

async function get(path, customEnv=env) {
  return worker.fetch(new Request("https://tcc.example"+path), customEnv);
}

let r=await get("/health");
assert.equal(r.status,200);
assert.equal((await r.json()).status,"ok");

r=await get("/api/v9/contract.json");
assert.equal(r.status,200);
assert.equal((await r.json()).snapshotId,"2026-09-30");

r=await get("/api/v9/countries/FR");
assert.equal(r.status,200);
let j=await r.json();
assert.equal(j.id,"FR");
assert.equal(j.coverage,"partial");
assert.equal(j.manifestUrl,"/api/v9/current/runtime/data/v9/france-static/manifest.json");
assert.equal(j.canonicalUrl,"/api/v9/current/snapshot-inputs/FR/france_public_charging_canonical.json");

r=await get("/api/v9/current/snapshot-inputs/DE/manifest.json");
assert.equal(r.status,200);
assert.equal((await r.json()).country,"DE");

r=await get("/api/v9/countries/ZZ");
assert.equal(r.status,404);

r=await get("/api/v9/contract.json",{TCC_DATA:new Bucket({})});
assert.equal(r.status,503);

r=await worker.fetch(new Request("https://tcc.example/api/v9/current/../secret"), env);
assert.ok([400,404].includes(r.status));

console.log("WORKER ROUTES PASS");
