import { describe, expect, it } from "vitest";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { recoveryConfiguration, recoveryPasswordPolicy, validRecoveryDestination } from "./recovery-policy";

const config = { ACCOUNT_RECOVERY_EMAIL_APPROVED: "true", RECOVERY_SMTP_HOST: "smtp.example.invalid", RECOVERY_SMTP_PORT: "587", RECOVERY_MAIL_FROM: "tia@example.invalid", RECOVERY_SMTP_USER: "synthetic", RECOVERY_SMTP_PASSWORD: "synthetic-only", RECOVERY_DAILY_EMAIL_LIMIT: "10", BETTER_AUTH_URL: "https://tia.example.invalid" };
describe("recovery requires explicit authorized delivery", () => {
  it("is disabled by default and rejects partial or insecure configuration", () => {
    expect(recoveryConfiguration({})).toBeNull();
    for (const key of Object.keys(config)) expect(recoveryConfiguration({ ...config, [key]: "" })).toBeNull();
    expect(recoveryConfiguration({ ...config, BETTER_AUTH_URL: "http://tia.example.invalid" })).toBeNull();
    expect(recoveryConfiguration({ ...config, RECOVERY_SMTP_PORT: "25" })).toBeNull();
    expect(recoveryConfiguration({ ...config, RECOVERY_DAILY_EMAIL_LIMIT: "0" })).toBeNull();
    expect(recoveryConfiguration({ ...config, RECOVERY_DAILY_EMAIL_LIMIT: "51" })).toBeNull();
  });
  it("accepts approved TLS SMTP without exposing it in the public readiness response", () => expect(recoveryConfiguration(config)).toMatchObject({ port: 587, cap: 10, origin: "https://tia.example.invalid" }));
  it("rejects recipient header injection and foreign reset links", () => {
    const origin = "https://tia.example.invalid";
    expect(validRecoveryDestination(origin, "owner@example.invalid", origin + "/reset-password#token=synthetic-test-token-12345678")).toBe(true);
    expect(validRecoveryDestination(origin, "owner@example.invalid", origin + "/reset-password?token=synthetic-test-token-12345678")).toBe(false);
    expect(validRecoveryDestination(origin, "owner@example.invalid\nBcc:foreign@example.invalid", origin + "/api/auth/reset-password/test")).toBe(false);
    expect(validRecoveryDestination(origin, "owner@example.invalid", "https://foreign.example/api/auth/reset-password/test")).toBe(false);
  });
});

describe("real auth library with an isolated in-memory mail sink", () => {
  async function fixture() {
    const data = { user: [], session: [], account: [], verification: [] };
    const messages: { token: string; url: string }[] = [];
    const baseURL = "http://localhost:3999";
    const auth = betterAuth({ baseURL, secret: "public-synthetic-recovery-test-only-never-a-real-key", database: memoryAdapter(data), emailAndPassword: { ...recoveryPasswordPolicy, sendResetPassword: async ({ token, url }) => { messages.push({ token, url }); } }, trustedOrigins: [baseURL], advanced: { disableOriginCheck: false }, logger: { disabled: true } });
    const headers = new Headers({ origin: baseURL });
    const signup = await auth.api.signUpEmail({ headers, body: { name: "Synthetic", email: "owner@example.invalid", password: "synthetic-before-only-1234" }, asResponse: true });
    expect(signup.status).toBe(200);
    const cookie = signup.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    const sessionHeaders = new Headers({ origin: baseURL, cookie });
    const request = (email = "owner@example.invalid") => auth.api.requestPasswordReset({ headers, body: { email, redirectTo: baseURL + "/reset-password" } });
    return { auth, messages, headers, sessionHeaders, data, request };
  }
  it("returns the same request response for existing and missing accounts; no real mail", async () => {
    const f = await fixture(); expect(await f.request()).toEqual(await f.request("missing@example.invalid")); expect(f.messages).toHaveLength(1);
  });
  it("resets once, revokes the old session, and rejects token reuse", async () => {
    const f = await fixture(); expect(await f.auth.api.getSession({ headers: f.sessionHeaders })).not.toBeNull(); await f.request();
    const body = { token: f.messages[0].token, newPassword: "synthetic-after-only-1234" };
    await f.auth.api.resetPassword({ headers: f.headers, body });
    expect(await f.auth.api.getSession({ headers: f.sessionHeaders })).toBeNull();
    await expect(f.auth.api.resetPassword({ headers: f.headers, body })).rejects.toThrow();
    await expect(f.auth.api.signInEmail({ headers: f.headers, body: { email: "owner@example.invalid", password: "synthetic-before-only-1234" } })).rejects.toThrow();
    expect(await f.auth.api.signInEmail({ headers: f.headers, body: { email: "owner@example.invalid", password: body.newPassword } })).toHaveProperty("user");
  });
  it("rejects expired links and weak new passwords", async () => {
    const f = await fixture(); await f.request();
    const token = f.messages[0].token;
    await expect(f.auth.api.resetPassword({ headers: f.headers, body: { token, newPassword: "weak" } })).rejects.toThrow();
    for (const row of f.data.verification as { expiresAt: Date }[]) row.expiresAt = new Date(Date.now() - 60000);
    await expect(f.auth.api.resetPassword({ headers: f.headers, body: { token, newPassword: "synthetic-after-only-1234" } })).rejects.toThrow();
  });
});
