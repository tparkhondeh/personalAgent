import assert from 'node:assert/strict';
const base=process.env.QA_BASE_URL||'http://localhost:3001';
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)&&base!=='https://personalagent.wealthos.ir:8443')throw Error('Only local/staging QA is permitted');
const email='clean-ui-20260906@example.invalid',password='Synthetic-clean-interface-20260906-only';
let checks=0;
const headers={'content-type':'application/json',origin:base};
async function login(rememberMe,signup=false){
  const response=await fetch(base+'/api/auth/'+(signup?'sign-up/email':'sign-in/email'),{method:'POST',headers,body:JSON.stringify({email,password,name:'آزمون رابط خلوت',rememberMe})});
  if(signup&&response.status===422)return login(rememberMe);
  assert.equal(response.status,200,'Synthetic authentication failed');
  const cookies=response.headers.getSetCookie();
  const token=cookies.find(value=>/session_token=/.test(value));assert(token,'Session cookie missing');
  assert.equal(/Max-Age=\d+/i.test(token),rememberMe,'Remember-me cookie policy mismatch'); checks+=2;
  return cookies.map(value=>value.split(';')[0]).join('; ');
}
let cookie=await login(false,true);
await fetch(base+'/api/auth/sign-out',{method:'POST',headers:{...headers,cookie},body:'{}'});
const revoked=await fetch(base+'/api/auth/get-session',{headers:{cookie}});assert.equal(await revoked.json(),null,'Signed-out session remains active');checks++;
cookie=await login(true); await fetch(base+'/api/auth/sign-out',{method:'POST',headers:{...headers,cookie},body:'{}'});
cookie=await login(false);
const initial=await fetch(base+'/api/tasks',{headers:{cookie}}).then(r=>r.json());
for(let i=1;i<=4;i++){
  const title='کنترل فهرست '+i;
  if(initial.data.some(task=>task.title===title))continue;
  const response=await fetch(base+'/api/tasks',{method:'POST',headers:{...headers,cookie},body:JSON.stringify({title,category:'PERSONAL',priority:'NORMAL',dueAt:new Date(Date.now()+15*60000).toISOString()})});
  assert.equal(response.status,201,'Synthetic list fixture failed');checks++;
}
console.log(JSON.stringify({checks,status:'passed',scope:'Synthetic account only; remembered/session cookies and logout revocation checked'}));
