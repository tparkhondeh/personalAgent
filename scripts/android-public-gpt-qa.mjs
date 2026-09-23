// Explicit funded synthetic acceptance only, from the exact signed APK's WebView.
// No provider key or owner account enters CI. Temporary fixture secret is never logged.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { waitUntil } from "./qa-wait-until.mjs";

const [packageId, output] = process.argv.slice(2);
assert.equal(packageId, "ir.wealthos.personalagent.stable40");
const fixture = JSON.parse(Buffer.from(process.env.TIA_GPT_QA_FIXTURE || "", "base64").toString());
assert(fixture.email.endsWith("@example.invalid") && fixture.id && fixture.password);
const base = "https://personalagent.wealthos.ir:8443";
const adb = (...args) => execFileSync("adb", args, { encoding: "utf8", timeout: 45000 }).trim();
const pid = adb("shell", "pidof", packageId).split(/\s+/)[0];
assert(/^\d+$/.test(pid));
try { adb("forward", "--remove", "tcp:9222"); } catch {}
adb("forward", "tcp:9222", `localabstract:webview_devtools_remote_${pid}`);
const targets = await fetch("http://127.0.0.1:9222/json/list").then(r => r.json());
const target = targets.find(t => t.type === "page" && new URL(t.url).origin === base);
assert(target?.webSocketDebuggerUrl, "A real public HTTPS WebView is required");
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
let id = 0, phase = "login";
const pending = new Map();
socket.addEventListener("message", event => {
  const message = JSON.parse(String(event.data));
  pending.get(message.id)?.(message);
});
function evaluate(expression) {
  return new Promise((resolve, reject) => {
    const current = ++id;
    const timer = setTimeout(() => { pending.delete(current); reject(new Error("Bounded evaluation timed out")); }, 45000);
    pending.set(current, message => {
      clearTimeout(timer); pending.delete(current);
      if (message.error || message.result?.exceptionDetails) reject(new Error("Synthetic page assertion failed"));
      else resolve(message.result.result.value);
    });
    socket.send(JSON.stringify({ id: current, method: "Runtime.evaluate", params: { expression, returnByValue: true, awaitPromise: true } }));
  });
}
const check = expression => evaluate(`(()=>{if(!(${expression}))throw Error('Acceptance failed');return true;})()`);
const wait = expression => waitUntil(() => evaluate(`Boolean(${expression})`).catch(() => false), "Expected UI state did not arrive", { attempts: 45, delayMs: 1000 });
const report = { passed: false, syntheticOnly: true, api: 36, paidRequestsAttempted: 0, checks: [] };
mkdirSync(output, { recursive: true });
try {
  await evaluate(`(async()=>{
    if(location.origin!==${JSON.stringify(base)}||!window.Capacitor?.isNativePlatform())throw Error('Wrong target');
    const f=${JSON.stringify(fixture)};
    const r=await fetch('/api/auth/sign-in/email',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:f.email,password:f.password,rememberMe:false})});
    const b=await r.json();if(!r.ok||b.user.id!==f.id)throw Error('Wrong synthetic account');return true;
  })()`);
  await evaluate(`location.href='/?view=assistant';true`);
  await wait(`document.querySelector('.chat-box textarea') && document.querySelector('.agent-toggle input[type="checkbox"]')`);
  await evaluate(`(async()=>{
    const session=await fetch('/api/auth/get-session').then(r=>r.json());
    if(session.user.id!==${JSON.stringify(fixture.id)})throw Error('Wrong account');
    const tasks=await fetch('/api/tasks').then(r=>r.json()),meetings=await fetch('/api/meetings').then(r=>r.json());
    window.__tiaQa={tasks:tasks.data.length,meetings:meetings.data.length,responses:[]};
    const original=window.fetch.bind(window);
    window.fetch=async(...args)=>{const r=await original(...args);if(typeof args[0]==='string'&&/^\\/api\\/agent(?:$|\\/drafts\\/)/.test(args[0])){const b=await r.clone().json();window.__tiaQa.responses.push({route:args[0],status:r.status,data:b.data});}return r;};
    const toggle=document.querySelector('.agent-toggle input[type="checkbox"]');if(toggle.checked)throw Error('Consent must start off');toggle.click();return true;
  })()`);
  const send = async message => {
    await evaluate(`(()=>{const box=document.querySelector('.chat-box textarea');if(box.disabled)throw Error('Disabled');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(box,${JSON.stringify(message)});box.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);
    await evaluate(`document.querySelector('.chat-box').requestSubmit();true`);
  };
  phase = "first-real-response"; report.paidRequestsAttempted++;
  await send("سه روز دیگر ساعت پنج عصر جلسه با تیم فروش دارم؛ یک روز قبل، سه ساعت قبل و یک ساعت قبل فقط داخل برنامه یادآوری کن.");
  await wait(`document.querySelector('.agent-review') && !document.querySelector('.chat-box textarea').disabled`);
  await check(`document.querySelector('.agent-mode').textContent.includes('GPT متصل')`);
  await evaluate(`(()=>{const q=window.__tiaQa,r=q.responses.filter(x=>x.route==='/api/agent').at(-1);if(r.status!==200||r.data.mode!=='online')throw Error('Not GPT');const p=r.data.draft.plan;if(p.time!=='17:00'||!/جلسه.*تیم فروش/.test(p.title)||JSON.stringify(p.reminderOffsets)!=='[1440,180,60]'||JSON.stringify(p.channels)!=='["IN_APP"]'||p.escalation)throw Error('Wrong proposal');q.first=r.data.draft;return true;})()`);
  report.checks.push("real-GPT-from-public-Android", "consent-started-off-and-clicked", "Persian-title-17:00-three-reminders");
  execFileSync(process.execPath, ["scripts/android-system-ui-check.mjs", `${output}/gpt-proposal-system-ui`, "inspect", `${output}/gpt-proposal.png`], { stdio: "inherit" });
  phase = "same-draft-follow-up"; report.paidRequestsAttempted++;
  await send("عنوانش را جلسه هماهنگی تیم فروش بگذار و ساعت را به هجده تغییر بده؛ بقیه جزئیات همان بماند.");
  await wait(`window.__tiaQa.responses.filter(x=>x.route==='/api/agent').length===2 && !document.querySelector('.chat-box textarea').disabled`);
  await evaluate(`(()=>{const q=window.__tiaQa,d=q.responses.filter(x=>x.route==='/api/agent').at(-1).data;if(d.mode!=='online'||d.draft.id!==q.first.id||d.draft.revision<=q.first.revision||d.draft.plan.time!=='18:00'||JSON.stringify(d.draft.plan.reminderOffsets)!=='[1440,180,60]')throw Error('Follow-up');return true;})()`);
  report.checks.push("same-draft-title-and-time-correction");
  phase = "cancel-no-effects";
  await evaluate(`(()=>{const b=[...document.querySelectorAll('.approval-actions button')].find(x=>x.textContent==='انصراف');if(!b||b.disabled)throw Error('Cancel unavailable');b.click();return true;})()`);
  await wait(`!document.querySelector('.agent-review') && document.querySelector('.agent-status')?.textContent.includes('لغو شد')`);
  await evaluate(`(async()=>{const q=window.__tiaQa,t=await fetch('/api/tasks').then(r=>r.json()),m=await fetch('/api/meetings').then(r=>r.json());if(t.data.length!==q.tasks||m.data.length!==q.meetings)throw Error('Unexpected execution');return true;})()`);
  report.checks.push("cancel-via-real-UI", "no-task-or-meeting-before-confirmation");
  report.passed = true;
} catch {
  report.failedPhase = phase; process.exitCode = 1;
} finally {
  try { await evaluate(`fetch('/api/auth/sign-out',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}).then(r=>r.ok)`); } catch {}
  socket.close();
  writeFileSync(`${output}/public-gpt.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
