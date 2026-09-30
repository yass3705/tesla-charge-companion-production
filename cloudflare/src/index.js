const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
};

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extra },
  });
}

async function r2Response(object, immutable = false) {
  if (!object) return json({ error: "not_found" }, 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("access-control-allow-origin", "*");
  headers.set(
    "cache-control",
    immutable
      ? "public, max-age=31536000, immutable"
      : "public, max-age=60, must-revalidate"
  );
  return new Response(object.body, { headers });
}

function safeSnapshotId(value) {
  return /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value || "");
}

function safeRelativePath(value) {
  return Boolean(value) && !value.includes("..") && !value.startsWith("/");
}

async function currentSnapshotId(env) {
  const pointer = await env.TCC_DATA.get("current.json");
  if (!pointer) return null;
  const current = await pointer.json();
  return safeSnapshotId(current?.snapshotId) ? current.snapshotId : null;
}

async function snapshotJson(env, snapshotId, path) {
  if (!safeSnapshotId(snapshotId) || !safeRelativePath(path)) return null;
  const object = await env.TCC_DATA.get(`snapshots/${snapshotId}/${path}`);
  return object ? object.json() : null;
}

function currentUrl(path) {
  return `/api/v9/current/${path}`;
}

function descriptorWithUrls(row) {
  const out = { ...row };
  for (const key of ["entry", "manifest", "canonical", "all", "offers"]) {
    if (typeof row?.[key] === "string") out[`${key}Url`] = currentUrl(row[key]);
  }
  if (typeof row?.direct === "string") out.directBaseUrl = currentUrl(row.direct);
  return out;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== "GET" && request.method !== "HEAD") {
      return json({ error: "method_not_allowed" }, 405, { allow: "GET, HEAD" });
    }

    if (url.pathname === "/health") {
      return json({ service: "tcc-v9", status: "ok" }, 200, {
        "cache-control": "no-store",
      });
    }

    if (url.pathname === "/api/v9/current.json") {
      return r2Response(await env.TCC_DATA.get("current.json"), false);
    }

    const snapshotId = await currentSnapshotId(env);

    if (url.pathname === "/api/v9/manifest.json") {
      if (!snapshotId) return json({ error: "current_pointer_missing" }, 503);
      return r2Response(
        await env.TCC_DATA.get(`snapshots/${snapshotId}/manifest.json`),
        false
      );
    }

    if (url.pathname === "/api/v9/contract.json") {
      if (!snapshotId) return json({ error: "current_pointer_missing" }, 503);
      return r2Response(
        await env.TCC_DATA.get(`snapshots/${snapshotId}/runtime-contract.json`),
        false
      );
    }

    const countryMatch = url.pathname.match(/^\/api\/v9\/countries\/([A-Za-z]{2}|TESLA)$/);
    if (countryMatch) {
      if (!snapshotId) return json({ error: "current_pointer_missing" }, 503);
      const key = countryMatch[1].toUpperCase();
      const contract = await snapshotJson(env, snapshotId, "runtime-contract.json");
      if (!contract) return json({ error: "runtime_contract_missing" }, 503);
      const row = contract?.datasets?.[key];
      if (!row) return json({ error: "country_not_found", country: key }, 404);
      return json({
        snapshotId,
        id: key,
        ...descriptorWithUrls(row),
      }, 200, { "cache-control": "public, max-age=60, must-revalidate" });
    }

    const currentFileMatch = url.pathname.match(/^\/api\/v9\/current\/(.+)$/);
    if (currentFileMatch) {
      if (!snapshotId) return json({ error: "current_pointer_missing" }, 503);
      const path = currentFileMatch[1];
      if (!safeRelativePath(path)) return json({ error: "invalid_path" }, 400);
      return r2Response(
        await env.TCC_DATA.get(`snapshots/${snapshotId}/${path}`),
        true
      );
    }

    const immutableMatch = url.pathname.match(/^\/api\/v9\/snapshots\/([^/]+)\/(.+)$/);
    if (immutableMatch) {
      const [, requestedSnapshotId, path] = immutableMatch;
      if (!safeSnapshotId(requestedSnapshotId)) {
        return json({ error: "invalid_snapshot_id" }, 400);
      }
      if (!safeRelativePath(path)) return json({ error: "invalid_path" }, 400);
      return r2Response(
        await env.TCC_DATA.get(`snapshots/${requestedSnapshotId}/${path}`),
        true
      );
    }

    if (env.ASSETS) return env.ASSETS.fetch(request);
    return json({ error: "not_found" }, 404);
  },
};
