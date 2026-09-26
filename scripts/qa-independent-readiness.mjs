// Local or explicitly named Staging only; synthetic accounts, no provider calls.
import assert from "node:assert/strict";
const base = process.env.QA_BASE_URL || "http://localhost:3001";
assert(/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base) || base === "https://personalagent.wealthos.ir:8443");
let cookie = "";
const checks = [];
async function request(path, method = "GET", body, origin = base, type = "application/json") {
  const headers = { cookie, "content-type": type };
  if (origin !== null) headers.origin = origin;
  return fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
}
function check(name, actual, expected) { checks.push({ name, passed: actual === expected, actual, expected }); }
// CI already creates five synthetic accounts. Reuse its known clean-UI fixture
// rather than bypassing or weakening the real signup rate limit.
const reuseCleanAccount = process.env.QA_REUSE_CLEAN_ACCOUNT === "true";
const signup = await request(reuseCleanAccount ? "/api/auth/sign-in/email" : "/api/auth/sign-up/email", "POST", { name: "آزمون مستقل امنیت", email: reuseCleanAccount ? "clean-ui-20260906@example.invalid" : `independent-${Date.now()}@example.invalid`, password: reuseCleanAccount ? "Synthetic-clean-interface-20260906-only" : "Synthetic-local-QA-only-20260913" });
assert(signup.ok, `Synthetic authentication failed: ${signup.status}`);
cookie = signup.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
assert(cookie);
const tasksBefore = (await (await request("/api/tasks")).json()).data.length;
const meetingsBefore = (await (await request("/api/meetings")).json()).data.length;
for (const [label, origin] of [["foreign", "https://untrusted.example"], ["missing", null], ["opaque", "null"], ["sibling", "https://other.wealthos.ir:8443"]]) {
  const response = await request("/api/tasks", "POST", { title: "آزمون مبدأ غیرمجاز" }, origin, "text/plain");
  check(`task-${label}-origin`, response.status, 403);
}
check("no-task-created-by-rejected-request", (await (await request("/api/tasks")).json()).data.length, tasksBefore);
for (const [path, method] of [["/api/tasks/synthetic-missing", "PATCH"], ["/api/tasks/synthetic-missing", "DELETE"], ["/api/meetings", "POST"], ["/api/meetings/synthetic-missing", "PATCH"], ["/api/meetings/synthetic-missing", "DELETE"], ["/api/preferences", "PUT"], ["/api/notifications", "PATCH"], ["/api/escalations", "POST"], ["/api/escalations", "PATCH"], ["/api/push-subscriptions", "POST"]]) {
  check(`${method}-${path}-foreign-origin`, (await request(path, method, {}, "https://untrusted.example")).status, 403);
}
const prefs = { timezone: "Asia/Tehran", locale: "fa-IR", workdayStartsAt: "09:00", workdayEndsAt: "18:00", workingDays: ["SAT", "SUN"], defaultReminderMins: 60, defaultReminderOffsets: [1440, 180, 60], quietHoursStartsAt: "00:00", quietHoursEndsAt: "00:00", smsEscalationEnabled: false, callEscalationEnabled: false };
check("invalid-timezone-rejected", (await request("/api/preferences", "PUT", { ...prefs, timezone: "Not/A_Timezone" })).status, 422);
check("valid-preferences-saved", (await request("/api/preferences", "PUT", prefs)).status, 200);
const pushAccountResponse = await request("/api/push-subscriptions");
check("owned-push-configuration", pushAccountResponse.status, 200);
const pushAccount = await pushAccountResponse.json();
assert(typeof pushAccount.userId === "string" && pushAccount.userId);
for (const endpoint of ["https://127.0.0.1/internal", "https://untrusted.example/push", "https://fcm.googleapis.com.evil.example/send", "http://fcm.googleapis.com/send"]) {
  check(`unsafe-push-rejected-${endpoint}`, (await request("/api/push-subscriptions", "POST", { userId: pushAccount.userId, endpoint, keys: { p256dh: "synthetic", auth: "synthetic" } })).status, 422);
}
const date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
const proposalResponse = await request("/api/agent", "POST", { message: `${date} ساعت پنج عصر جلسه با تیم فروش دارم؛ یک روز قبل، سه ساعت قبل و یک ساعت قبل یادم بنداز.`, localOnly: true });
check("local-assistant-still-works", proposalResponse.status, 200);
const proposal = (await proposalResponse.json()).data;
check("editable-title", proposal?.draft?.plan?.title, "جلسه با تیم فروش");
check("24-hour-time", proposal?.draft?.plan?.time, "17:00");
check("three-reminders", JSON.stringify(proposal?.draft?.plan?.reminderOffsets), "[1440,180,60]");
check("no-meeting-before-confirmation", (await (await request("/api/meetings")).json()).data.length, meetingsBefore);
const logout = await request("/api/auth/sign-out", "POST", {});
check("sign-out", logout.status, 200);
check("revoked-session-cannot-create", (await request("/api/tasks", "POST", { title: "نباید ثبت شود" })).status, 401);
const passed = checks.every(check => check.passed);
console.log(JSON.stringify({ passed, checks: checks.length, results: checks, target: base, syntheticDataRetained: true, externalProvidersInvoked: false }));
if (!passed) process.exitCode = 1;
