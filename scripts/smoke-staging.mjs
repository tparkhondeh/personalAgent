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

await call("/api/tasks");
const task = await call("/api/tasks", {
  method: "POST",
  body: JSON.stringify({
    title: "کنترل کار فوری محیط آزمایشی",
    category: "WORK",
    priority: "URGENT",
    dueAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    reminderMinutes: 0,
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

await call("/api/notifications");
await call("/api/escalations", { method: "POST" });
const escalations = await call("/api/escalations");

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
  escalationAlarms: escalations.data.alarms.length,
}, null, 2)}\n`);
