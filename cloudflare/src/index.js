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
    immutable ? "public, max-age=31536000, immutable" : "public, max-age=60, must-revalidate"
  );
  return new Response(object.body, { headers });
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

    if (url.pathname === "/api/v9/manifest.json") {
      const pointer = await env.TCC_DATA.get("current.json");
      if (!pointer) return json({ error: "current_pointer_missing" }, 503);
      const current = await pointer.json();
      if (!current?.snapshotId) return json({ error: "invalid_current_pointer" }, 503);
      const key = `snapshots/${current.snapshotId}/manifest.json`;
      return r2Response(await env.TCC_DATA.get(key), false);
    }

    const match = url.pathname.match(/^\/api\/v9\/snapshots\/([^/]+)\/(.+)$/);
    if (match) {
      const [, snapshotId, path] = match;
      if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(snapshotId)) {
        return json({ error: "invalid_snapshot_id" }, 400);
      }
      if (path.includes("..")) return json({ error: "invalid_path" }, 400);
      const key = `snapshots/${snapshotId}/${path}`;
      return r2Response(await env.TCC_DATA.get(key), true);
    }

    if (env.ASSETS) return env.ASSETS.fetch(request);
    return json({ error: "not_found" }, 404);
  },
};
