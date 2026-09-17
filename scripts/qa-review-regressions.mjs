import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import path from 'node:path';
const base = process.env.QA_BASE_URL;
assert.equal(base, 'http://127.0.0.1:3002', 'Dedicated isolated review server only; separate browser-cookie host');
const file = path.resolve(process.env.QA_DATABASE_FILE || '');
const safeRoot = path.resolve('backups/clean-start') + path.sep;
assert(file.startsWith(safeRoot) && path.basename(file) === 'tia.db', 'Only prepared disposable QA database');
const db = createClient({ url: 'file:' + file.replaceAll('\\', '/') });
try {
  const users = await db.execute('SELECT email FROM User');
  assert(users.rows.length > 0 && users.rows.every(row => String(row.email).endsWith('@example.invalid')), 'Non-synthetic data must never be mutated by QA');
  const headers = { 'content-type': 'application/json', origin: base };
  const login = await fetch(base + '/api/auth/sign-in/email', { method:'POST', headers, body:JSON.stringify({ email:'clean-ui-20260906@example.invalid', password:'Synthetic-clean-interface-20260906-only' }) });
  assert.equal(login.status, 200);
  headers.cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const request = (url, method='GET', body) => fetch(base+url,{method,headers,body:body ? JSON.stringify(body) : undefined});
  let checks=0;
  for (const kind of ['tasks','meetings']) {
    const starts = new Date(Date.now()+48*3600_000).toISOString();
    const ends = new Date(Date.parse(starts)+3600_000).toISOString();
    const body = kind==='tasks' ? {title:'بازبینی ساختگی',category:'PERSONAL',priority:'NORMAL',startAt:starts,dueAt:ends} : {title:'جلسه بازبینی ساختگی',startsAt:starts,endsAt:ends,priority:'NORMAL'};
    const created=await request('/api/'+kind,'POST',body);assert.equal(created.status,201);
    const item=(await created.json()).data;
    const fk=kind==='tasks'?'taskId':'meetingId';
    const before=await db.execute({sql:`SELECT id,status,scheduledFor FROM Reminder WHERE ${fk}=? ORDER BY id`,args:[item.id]});
    assert(before.rows.length>0);const sentId=String(before.rows[0].id);
    await db.execute({sql:'UPDATE Reminder SET status=? WHERE id=?',args:['SENT',sentId]});
    const edited=await request('/api/'+kind+'/'+item.id,'PATCH',{title:'عنوان تازه ساختگی'});assert.equal(edited.status,200);
    const updated=(await edited.json()).data;
    assert.equal(kind==='tasks'?updated.dueAt:updated.startsAt,kind==='tasks'?item.dueAt:item.startsAt);
    const after=await db.execute({sql:`SELECT id,status,scheduledFor FROM Reminder WHERE ${fk}=? ORDER BY id`,args:[item.id]});
    assert.deepEqual(after.rows.map(row=>[row.id,row.scheduledFor]),before.rows.map(row=>[row.id,row.scheduledFor]));
    assert.equal(after.rows.find(row=>row.id===sentId).status,'SENT');checks+=4;
    const completed=await request('/api/'+kind+'/'+item.id,'PATCH',{status:'DONE'});assert.equal(completed.status,200);
    const deleted=await request('/api/'+kind+'/'+item.id,'DELETE');assert.equal(deleted.status,200);
    const receipt=await deleted.json();
    const again=await request('/api/'+kind+'/'+item.id,'DELETE');assert.equal(again.status,200);assert.deepEqual(await again.json(),receipt);checks+=3;
  }
  console.log(JSON.stringify({passed:true,checks,scope:'Dedicated synthetic database, real HTTP and SQLite history/receipt readback',externalProvidersInvoked:false}));
} finally { db.close(); }
