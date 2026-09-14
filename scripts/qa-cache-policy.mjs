// Read-only checks against the built server, not dev-mode header assumptions.
import assert from "node:assert/strict";

const base = process.env.QA_BASE_URL || "http://localhost:3000";
assert(/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base));
let checks = 0;
let stylesheet;
for (const path of ["/", "/login", "/forgot-password", "/reset-password", "/api/health", "/api/account-recovery", "/api/tasks", "/sw.js", "/pwa-recovery.js"]) {
  const response = await fetch(base + path, { signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, path === "/api/tasks" ? 401 : 200, path);
  const cache = response.headers.get("cache-control") || "";
  assert(/(?:^|,)\s*no-store(?:,|$)/i.test(cache), `${path}: missing no-store: ${cache}`);
  assert(!/(?:s-maxage=[1-9]|immutable|(?:^|,)\s*public(?:,|$))/i.test(cache), `${path}: unsafe cache: ${cache}`);
  checks += 3;
  const body = await response.text();
  if (path === "/") stylesheet = body.match(/href="([^"<>]+\.css)"/)?.[1];
}
assert(stylesheet?.startsWith("/_next/static/"), "Expected a content-hashed stylesheet");
const asset = await fetch(base + stylesheet, { signal: AbortSignal.timeout(15000) });
assert.equal(asset.status, 200);
assert.match(asset.headers.get("cache-control") || "", /immutable/);
checks += 3;
console.log(JSON.stringify({ passed: true, checks, target: base, mutations: false, hashedAssetsStillCached: true }));
