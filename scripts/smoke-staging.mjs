const baseUrl = new URL(process.argv[2] || "https://personalagent.wealthos.ir:8443").origin;
const email = process.argv[3] || `staging-qa-${Date.now()}@example.invalid`;
const password = "Staging-only-password-2026";
const cookies = new Map();

function storeCookies(response) {
  for (const value of response.headers.getSetCookie?.() || []) {
    const pair = value.split(";", 1)[0];
    const separator = pair.indexOf("=");
    if (separator > 0) cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
}

async function call(path, options = {}, expectedStatus = 200) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      accept: "application/json, text/html",
      origin: baseUrl,
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(cookies.size ? { cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join("; ") } : {}),
      ...options.headers,
    },
    redirect: "manual",
  });
  storeCookies(response);
  const text = await response.text();
  if (response.status !== expectedStatus) throw new Error(`${options.method || "GET"} ${path} returned ${response.status}: ${text.slice(0, 300)}`);
  const type = response.headers.get("content-type") || "";
  return type.includes("json") ? JSON.parse(text) : text;
}

const health = await call("/api/health");
if (health.status !== "ok" || health.database !== "connected") throw new Error("Staging health check is incomplete.");
const login = await call("/login");
if (!login.includes("خوش برگشتی")) throw new Error("The Persian login page was not rendered.");

await call("/api/auth/sign-up/email", {
  method: "POST",
  body: JSON.stringify({ name: "Staging QA", email, password }),
});
if (!cookies.size) throw new Error("Sign-up did not establish a secure session.");

const preferences = await call("/api/preferences", {
  method: "PUT",
  body: JSON.stringify({
    timezone: "Asia/Tehran",
    locale: "fa-IR",
    workdayStartsAt: "09:00",
    workdayEndsAt: "18:00",
    workingDays: ["SAT", "SUN", "MON", "TUE", "WED"],
    defaultReminderMins: 60,
    defaultReminderOffsets: [1440, 180, 60],
    quietHoursStartsAt: "22:00",
    quietHoursEndsAt: "08:00",
    planningProfile: "BALANCED",
    urgentEscalationEnabled: true,
    urgentRepeatMinutes: 15,
    urgentMaxRepeats: 3,
    androidAlarmEnabled: true,
    highPriorityEnabled: true,
    smsEscalationEnabled: false,
    callEscalationEnabled: false,
    emergencyContactName: null,
    emergencyPhone: null,
  }),
});
if (preferences.data.defaultReminderOffsets.join(",") !== "1440,180,60") throw new Error("Multiple default reminders were not saved.");

await call("/api/tasks");
const task = await call("/api/tasks", {
  method: "POST",
  body: JSON.stringify({
    title: "کنترل کار فوری محیط آزمایشی",
    category: "WORK",
    priority: "URGENT",
    dueAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  }),
}, 201);

const startsAt = new Date(Date.now() + 60 * 60_000);
const meeting = await call("/api/meetings", {
  method: "POST",
  body: JSON.stringify({
    title: "جلسه کنترل محیط آزمایشی",
    attendees: [],
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + 30 * 60_000).toISOString(),
    timezone: "Asia/Tehran",
  }),
}, 201);
if (task.meta.remindersScheduled !== 3 || meeting.meta.remindersScheduled !== 3) throw new Error("Three reminders were not created for both tasks and meetings.");

await call("/api/notifications");
await call("/api/escalations", { method: "POST" });
const escalations = await call("/api/escalations");
const agent = await call("/api/agent", { method: "POST", body: JSON.stringify({ message: "برنامه امروز من را خلاصه کن", timezone: "Asia/Tehran", localOnly: true }) });
if (!agent.data.reply || agent.data.proposal.kind !== "PLAN") throw new Error("The assistant did not return a usable planning response.");
const integrations = await call("/api/integrations");
if (!integrations.data?.llm?.mode || !integrations.data?.call?.mode) throw new Error("Integration readiness status is incomplete.");

await call(`/api/tasks/${task.data.id}`, { method: "DELETE" }, 204);
await call(`/api/meetings/${meeting.data.id}`, { method: "DELETE" }, 204);

process.stdout.write(`${JSON.stringify({
  status: "ok",
  baseUrl,
  email,
  login: "persian-rendered",
  task: "created-and-deleted",
  meeting: "created-and-deleted",
  notifications: "reachable",
  reminders: "three-default-offsets-saved",
  assistant: `${agent.data.mode}-response-ok`,
  integrations: `llm-${integrations.data.llm.mode},call-${integrations.data.call.mode}`,
  escalationAlarms: escalations.data.alarms.length,
}, null, 2)}\n`);
