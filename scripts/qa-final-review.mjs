// Real HTTP + SQLite readback, only in the disposable CI database; no providers.
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import path from 'node:path';

assert.equal(process.env.CI, 'true');
const base = process.env.QA_BASE_URL;
assert.equal(base, 'http://localhost:3000');
const expectedFile = path.resolve('data/ci.db').replaceAll('\\', '/');
assert.equal(process.env.DATABASE_URL, 'file:' + expectedFile);
assert.equal(process.env.OPENAI_COST_APPROVED, 'false');
const db = createClient({ url: process.env.DATABASE_URL });
let checks = 0;
try {
  const users = (await db.execute('SELECT id,email FROM User')).rows;
  assert(users.length && users.every(row => String(row.email).endsWith('@example.invalid')), 'Synthetic database only');
  const owner = users.find(row => row.email === 'clean-ui-20260906@example.invalid');
  const other = users.find(row => /^completed-qa-\d+@example.invalid$/.test(String(row.email)));
  assert(owner && other && owner.id !== other.id, 'Reuse existing CI fixtures, never evade signup limits');
  const headers = { 'content-type': 'application/json', origin: base };
  async function login(user, password) {
    const response = await fetch(base + '/api/auth/sign-in/email', { method: 'POST', headers, body: JSON.stringify({ email: user.email, password }) });
    assert.equal(response.status, 200, 'Synthetic login');
    return response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  }
  const cookie = await login(owner, 'Synthetic-clean-interface-20260906-only');
  const otherCookie = await login(other, 'Synthetic-completed-QA-only-20260910');
  async function call(route, method, body, status = 200, auth = cookie, extra = {}) {
    const response = await fetch(base + route, { method, headers: { ...headers, cookie: auth, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
    assert.equal(response.status, status, route + ' status'); checks++;
    return response.json();
  }
  const future = minutes => new Date(Date.now() + minutes * 60000).toISOString();
  const task = (await call('/api/tasks', 'POST', { title: 'آزمون حفظ فاصله سفارشی', category: 'PERSONAL', priority: 'NORMAL', dueAt: future(2880), reminderMinutes: 30 }, 201)).data;
  const later = future(4320);
  await call('/api/tasks/' + task.id, 'PATCH', { dueAt: later });
  const pending = (await db.execute({ sql: "SELECT scheduledFor FROM Reminder WHERE taskId=? AND status IN ('PENDING','DEVICE_PENDING')", args: [task.id] })).rows;
  assert.equal(pending.length, 1); checks++;
  const asTime = value => typeof value === 'number' || /^\d+$/.test(String(value)) ? Number(value) : Date.parse(String(value));
  assert.equal(asTime(pending[0].scheduledFor), Date.parse(later) - 30 * 60000); checks++;
  for (const kind of ['tasks', 'meetings']) {
    const at = future(120), before = Date.now();
    const input = kind === 'tasks'
      ? { title: 'آزمون حذف زمان گذشته', category: 'PERSONAL', priority: 'NORMAL', dueAt: at }
      : { title: 'جلسه آزمون زمان آینده', startsAt: at, endsAt: future(180) };
    const created = await call('/api/' + kind, 'POST', input, 201);
    const foreign = kind === 'tasks' ? 'taskId' : 'meetingId';
    const reminders = (await db.execute({ sql: `SELECT scheduledFor FROM Reminder WHERE ${foreign}=? AND status IN ('PENDING','DEVICE_PENDING')`, args: [created.data.id] })).rows;
    assert.equal(reminders.length, 1, 'Only one-hour reminder is still future'); checks++;
    assert(reminders.every(row => asTime(row.scheduledFor) > before)); checks++;
    assert.equal(created.meta.remindersScheduled, reminders.length); checks++;
    await call('/api/' + kind + '/' + created.data.id, 'PATCH', { status: 'DONE' });
  }
  await call('/api/tasks/' + task.id, 'PATCH', { status: 'DONE' });
  const subscription = suffix => ({ userId: owner.id, endpoint: 'https://fcm.googleapis.com/fcm/send/tia-ci-final-review-' + suffix, keys: { p256dh: 'synthetic-public-key', auth: 'synthetic-auth' } });
  const first = subscription('device-one'), second = subscription('device-two');
  await call('/api/push-subscriptions', 'POST', first, 201);
  await call('/api/push-subscriptions', 'POST', second, 201);
  await call('/api/push-subscriptions', 'POST', { ...first, userId: other.id }, 409, otherCookie);
  await call('/api/push-subscriptions', 'DELETE', first, 409, otherCookie);
  await call('/api/push-subscriptions', 'DELETE', { ...first, userId: other.id }, 200, otherCookie);
  assert.equal((await db.execute({ sql: 'SELECT userId FROM PushSubscription WHERE endpoint=?', args: [first.endpoint] })).rows[0]?.userId, owner.id); checks++;
  await call('/api/push-subscriptions', 'DELETE', first);
  await call('/api/push-subscriptions', 'DELETE', first);
  assert.equal((await db.execute({ sql: 'SELECT count(*) AS n FROM PushSubscription WHERE endpoint=?', args: [first.endpoint] })).rows[0].n, 0); checks++;
  assert.equal((await db.execute({ sql: 'SELECT userId FROM PushSubscription WHERE endpoint=?', args: [second.endpoint] })).rows[0]?.userId, owner.id); checks++;
  await call('/api/auth/sign-out', 'POST', {}, 409, cookie, { 'x-tia-user-id': String(other.id) });
  assert((await call('/api/auth/get-session', 'GET')).user.id === owner.id); checks++;
  await call('/api/auth/sign-out', 'POST', {}, 200, cookie, { 'x-tia-user-id': String(owner.id) });
  assert.equal(await call('/api/auth/get-session', 'GET'), null); checks++;
  console.log(JSON.stringify({ passed: true, checks, scope: 'Synthetic CI accounts, real HTTP and SQLite readback', externalProviderCalls: 0 }));
} finally { db.close(); }
