// Only isolated loopback QA. Reuses CI's explicit synthetic account; no providers.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const base = process.env.QA_BASE_URL || "http://localhost:3000";
assert(/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base));
let cookie = "";
let checks = 0;
async function request(path, method = "GET", body, key, origin = base) {
  return fetch(base + path, { method, headers: { origin, cookie, "content-type": "application/json", ...(key ? { "idempotency-key": key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
}
const login = await request("/api/auth/sign-in/email", "POST", { email: "clean-ui-20260906@example.invalid", password: "Synthetic-clean-interface-20260906-only" });
assert(login.ok, `Synthetic login failed ${login.status}`);
cookie = login.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
assert(cookie);
for (const kind of ["tasks", "meetings"]) {
  const path = `/api/${kind}`, key = randomUUID();
  const date = new Date(Date.now() + 4 * 86400000);
  const body = kind === "tasks" ? { title: "آزمون ساختگی ثبت دوباره", dueAt: date.toISOString() } : { title: "جلسه ساختگی ثبت دوباره", startsAt: date.toISOString(), endsAt: new Date(+date + 3600000).toISOString() };
  const before = (await (await request(path)).json()).data.length;
  const first = await request(path, "POST", body, key); assert.equal(first.status, 201); const original = (await first.json()).data; checks++;
  const responses = await Promise.all(Array.from({ length: 5 }, () => request(path, "POST", body, key)));
  for (const response of responses) { assert.equal(response.status, 201); assert.equal((await response.json()).data.id, original.id); checks++; }
  assert.equal((await (await request(path)).json()).data.length, before + 1); checks++;
  assert.equal((await request(path, "POST", { ...body, title: "درخواست متفاوت" }, key)).status, 409); checks++;
  assert.equal((await request(path, "POST", body, "short")).status, 422); checks++;
  assert.equal((await request(path, "POST", body, key, "https://foreign.example")).status, 403); checks++;
  assert.equal((await request(`${path}/${original.id}`, "PATCH", { status: "DONE" })).status, 200);
  assert.equal((await (await request(path, "POST", body, key)).json()).data.status, "DONE"); checks++;
  assert.equal((await request(`${path}/${original.id}`, "DELETE")).status, 204);
  // Soft cancellation is never undone; hard deletion must fail, never recreate.
  const afterDelete = await request(path, "POST", body, key);
  assert([201, 409].includes(afterDelete.status));
  if (afterDelete.status === 201) assert.equal((await afterDelete.json()).data.status, "CANCELLED"); checks++;
  assert.equal((await (await request(path)).json()).data.length, before); checks++;
  const parallelKey = randomUUID();
  const parallel = await Promise.all(Array.from({ length: 3 }, () => request(path, "POST", body, parallelKey)));
  const ids = new Set();
  for (let response of parallel) {
    // SQLite can explicitly report a transient competing write; retry the SAME key.
    assert([201, 503].includes(response.status));
    if (response.status === 503) response = await request(path, "POST", body, parallelKey);
    assert.equal(response.status, 201); ids.add((await response.json()).data.id); checks++;
  }
  assert.equal(ids.size, 1); assert.equal((await (await request(path)).json()).data.length, before + 1); checks += 2;
  const parallelId = [...ids][0];
  assert.equal((await request(`${path}/${parallelId}`, "PATCH", { status: "DONE" })).status, 200);
  assert.equal((await request(`${path}/${parallelId}`, "DELETE")).status, 204);
}
console.log(JSON.stringify({ passed: true, checks, syntheticDataRetained: true, externalProvidersInvoked: false }));
