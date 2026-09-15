import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loginReturnTo } from "./login-redirect";

const mocks = vi.hoisted(() => ({
  data: { user: [], session: [], account: [], verification: [] } as Record<string, Record<string, unknown>[]>,
  headers: vi.fn(), connection: vi.fn(async () => {}),
  redirect: vi.fn((path: string) => { throw new Error(`NEXT_REDIRECT:${path}`); }),
}));
vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ db: {} }));
vi.mock("@better-auth/prisma-adapter", async () => {
  const { memoryAdapter } = await import("better-auth/adapters/memory");
  return { prismaAdapter: () => memoryAdapter(mocks.data) };
});
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/server", () => ({ connection: mocks.connection, after: vi.fn() }));
vi.mock("@/components/login-form", () => ({ LoginForm: () => null }));

describe("validated login destination", () => {
  it("retains the assistant destination", () => expect(loginReturnTo("assistant")).toBe("/?view=assistant"));
  it.each([undefined, "", "/", "/login", "https://example.invalid", "//example.invalid", "\\\\example.invalid", "javascript:alert(1)", "%2f%2fexample.invalid", "assistant\n", ["assistant"], ["assistant", "https://example.invalid"]])("rejects unapproved/ambiguous returnTo %j", value => {
    expect(loginReturnTo(value)).toBe("/");
  });
});

describe("login page with the real configured Better Auth and isolated memory storage", () => {
  const baseURL = "http://localhost:3998";
  const credentials = { email: "remember-session@example.invalid", password: "public-synthetic-test-only-1234" };
  let auth: typeof import("./auth").auth;
  let page: typeof import("@/app/login/page").default;
  const origin = new Headers({ origin: baseURL });
  const visit = (returnTo?: string | string[]) => page({ searchParams: Promise.resolve({ returnTo }) });
  const requestHeaders = (response: Response) => new Headers({ origin: baseURL, cookie: response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ") });
  const signIn = (rememberMe: boolean) => auth.api.signInEmail({ headers: origin, body: { ...credentials, rememberMe }, asResponse: true });

  beforeAll(async () => {
    vi.stubEnv("BETTER_AUTH_URL", baseURL);
    vi.stubEnv("BETTER_AUTH_SECRET", "public-synthetic-login-tests-only-not-an-operational-secret");
    vi.stubEnv("ACCOUNT_RECOVERY_EMAIL_APPROVED", "false");
    ({ auth } = await import("./auth"));
    ({ default: page } = await import("@/app/login/page"));
    const signup = await auth.api.signUpEmail({ headers: origin, body: { name: "Synthetic Session", ...credentials }, asResponse: true });
    expect(signup.status).toBe(200);
  }, 30000);
  beforeEach(() => { mocks.redirect.mockClear(); mocks.headers.mockResolvedValue(new Headers()); });
  afterAll(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it("persists a 30-day HttpOnly cookie and skips login on a fresh request with that cookie", async () => {
    const response = await signIn(true);
    expect(response.status).toBe(200);
    const cookie = response.headers.getSetCookie().find(value => value.startsWith("better-auth.session_token="))!;
    expect(cookie).toMatch(/Max-Age=2592000/i);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).not.toContain(credentials.password);
    const headers = requestHeaders(response);
    const session = await auth.api.getSession({ headers });
    expect(session?.session.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 86400_000);
    mocks.headers.mockResolvedValue(new Headers(headers));
    await expect(visit("assistant")).rejects.toThrow("NEXT_REDIRECT:/?view=assistant");
    await expect(visit("//example.invalid")).rejects.toThrow("NEXT_REDIRECT:/");
    expect(mocks.connection).toHaveBeenCalled();
  });

  it("keeps rememberMe=false as a browser-session cookie, while accepting it until expiry", async () => {
    const response = await signIn(false);
    expect(response.status).toBe(200);
    const cookie = response.headers.getSetCookie().find(value => value.startsWith("better-auth.session_token="))!;
    expect(cookie).not.toMatch(/Max-Age=|Expires=/i);
    const headers = requestHeaders(response);
    const session = await auth.api.getSession({ headers });
    expect(session?.session.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 86400_000);
    mocks.headers.mockResolvedValue(headers);
    await expect(visit()).rejects.toThrow("NEXT_REDIRECT:/");
    // A new browser session no longer sends the transient cookie.
    mocks.headers.mockResolvedValue(new Headers(origin));
    expect((await visit()).type).toBeTypeOf("function");
  });

  it("retains the one-day refresh threshold and actually renews an eligible remembered session", async () => {
    const response = await signIn(true);
    const headers = requestHeaders(response);
    const session = await auth.api.getSession({ headers });
    const row = mocks.data.session.find(value => value.id === session!.session.id)!;
    const originalExpiry = row.expiresAt;
    const context = await auth.$context;
    expect(context.sessionConfig).toMatchObject({ expiresIn: 30 * 86400, updateAge: 86400 });
    await auth.api.getSession({ headers });
    expect(row.expiresAt).toEqual(originalExpiry);
    row.expiresAt = new Date(Date.now() + 28 * 86400_000);
    const refreshed = await auth.api.getSession({ headers });
    expect(refreshed!.session.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 86400_000);
  });

  it("renders the login form for an expired session even when the signed cookie is present", async () => {
    const response = await signIn(true);
    const headers = requestHeaders(response);
    const session = await auth.api.getSession({ headers });
    mocks.data.session.find(value => value.id === session!.session.id)!.expiresAt = new Date(Date.now() - 60000);
    mocks.headers.mockResolvedValue(headers);
    expect((await visit("assistant")).type).toBeTypeOf("function");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("does not accept a revoked session cookie", async () => {
    const response = await signIn(true);
    const headers = requestHeaders(response);
    expect(await auth.api.getSession({ headers })).not.toBeNull();
    await auth.api.signOut({ headers });
    // Replay the original request cookie: revocation must win over its signature.
    mocks.headers.mockResolvedValue(headers);
    expect((await visit("assistant")).type).toBeTypeOf("function");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it.each(["", "better-auth.session_token=forged.invalid-signature"])("requires a real session for cookie %j", async cookie => {
    mocks.headers.mockResolvedValue(new Headers({ cookie }));
    expect((await visit()).type).toBeTypeOf("function");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
