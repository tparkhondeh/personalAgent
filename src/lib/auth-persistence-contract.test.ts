import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "@/generated/prisma/client";

const fixture = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ get db() { return fixture.db; } }));

// Exercise the real SDK + Prisma adapter + application configuration, not a
// mocked successful signup. The DB is fresh, outside the project and retained.
describe("real password-account persistence contract", () => {
  const base = "http://localhost:3499";
  const email = "auth-contract@example.invalid";
  const password = "Synthetic-password-only-20261111";
  let db: PrismaClient;
  let auth: typeof import("./auth").auth;
  const call = (route: string, body: unknown, cookie = "") => auth.handler(new Request(base + "/api/auth/" + route, {
    method: "POST", headers: { "content-type": "application/json", origin: base, cookie }, body: JSON.stringify(body),
  }));

  beforeAll(async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tia-auth-contract-"));
    const url = `file:${path.join(dir, "test.db").replaceAll("\\", "/")}`;
    execFileSync(process.execPath, ["scripts/migrate.mjs"], {
      env: { ...process.env, DATABASE_URL: url }, stdio: "pipe", windowsHide: true,
    });
    db = new PrismaClient({ adapter: new PrismaLibSql({ url }) });
    fixture.db = db;
    vi.stubEnv("BETTER_AUTH_URL", base);
    vi.stubEnv("BETTER_AUTH_SECRET", randomBytes(32).toString("base64url"));
    vi.stubEnv("ACCOUNT_RECOVERY_EMAIL_APPROVED", "false");
    ({ auth } = await import("./auth"));
  });

  afterAll(async () => {
    await db?.$disconnect();
    fixture.db = undefined;
    vi.unstubAllEnvs();
  });

  it("creates a credential account with server-owned legacy issuer metadata", async () => {
    const response = await call("sign-up/email", { name: "Synthetic contract", email, password, issuer: "client-forged" });
    expect(response.status).toBe(200);
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    const account = await db.account.findFirstOrThrow({ where: { userId: user.id } });
    expect(account.providerId).toBe("credential");
    expect(account.accountId).toBe(user.id);
    expect(account.issuer).toBe("credential");
    expect(account.password).not.toBe(password);
  });

  it("keeps existing issuer values while login, remember-me and logout work", async () => {
    const legacyEmail = "legacy-auth-contract@example.invalid";
    expect((await call("sign-up/email", { name: "Synthetic existing", email: legacyEmail, password })).status).toBe(200);
    const user = await db.user.findUniqueOrThrow({ where: { email: legacyEmail } });
    const account = await db.account.findFirstOrThrow({ where: { userId: user.id } });
    await db.account.update({ where: { id: account.id }, data: { issuer: "existing-legacy-issuer" } });
    const response = await call("sign-in/email", { email: legacyEmail, password, rememberMe: true });
    expect(response.status).toBe(200);
    const cookies = response.headers.getSetCookie();
    expect(cookies.some(cookie => /session_token=.*Max-Age=/i.test(cookie))).toBe(true);
    const cookie = cookies.map(value => value.split(";")[0]).join("; ");
    const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
    expect(session?.user.id).toBe(user.id);
    expect((await call("sign-out", {}, cookie)).status).toBe(200);
    expect(await auth.api.getSession({ headers: new Headers({ cookie }) })).toBeNull();
    expect((await db.account.findUniqueOrThrow({ where: { id: account.id } })).issuer).toBe("existing-legacy-issuer");
    expect(await db.user.count({ where: { id: user.id } })).toBe(1);
  });
});
