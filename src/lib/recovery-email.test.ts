import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ count: vi.fn(), create: vi.fn(), update: vi.fn(), transaction: vi.fn(), transport: vi.fn(), send: vi.fn(), close: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ db: { $transaction: mocks.transaction, auditLog: { update: mocks.update } } }));
vi.mock("nodemailer", () => ({ default: { createTransport: mocks.transport } }));
import { sendRecoveryEmail } from "./recovery-email";

describe("authorized recovery mail delivery without real SMTP", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    for (const [key, value] of Object.entries({ ACCOUNT_RECOVERY_EMAIL_APPROVED: "true", RECOVERY_SMTP_HOST: "smtp.example.invalid", RECOVERY_SMTP_PORT: "587", RECOVERY_MAIL_FROM: "tia@example.invalid", RECOVERY_SMTP_USER: "synthetic", RECOVERY_SMTP_PASSWORD: "synthetic-only", RECOVERY_DAILY_EMAIL_LIMIT: "10", BETTER_AUTH_URL: "https://tia.example.invalid" })) vi.stubEnv(key, value);
    mocks.transaction.mockImplementation(async fn => fn({ auditLog: { count: mocks.count, create: mocks.create } }));
    mocks.count.mockResolvedValue(0); mocks.create.mockResolvedValue({ id: "synthetic-reservation" }); mocks.update.mockResolvedValue({});
    mocks.transport.mockReturnValue({ sendMail: mocks.send, close: mocks.close }); mocks.send.mockResolvedValue({});
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
  const send = () => sendRecoveryEmail({ id: "synthetic-user", email: "owner@example.invalid" }, "synthetic-test-token-12345678");
  it("requires explicit approval even with all credentials present", async () => {
    vi.stubEnv("ACCOUNT_RECOVERY_EMAIL_APPROVED", "false"); await send(); expect(mocks.transaction).not.toHaveBeenCalled(); expect(mocks.transport).not.toHaveBeenCalled();
  });
  it("reserves before sending, requires TLS, and never fetches attachments or URLs", async () => {
    await send(); expect(mocks.create).toHaveBeenCalledOnce(); expect(mocks.send).toHaveBeenCalledOnce();
    expect(mocks.transport).toHaveBeenCalledWith(expect.objectContaining({ requireTLS: true, logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true, tls: { rejectUnauthorized: true, minVersion: "TLSv1.2", servername: "smtp.example.invalid" } }));
    expect(mocks.send.mock.calls[0][0].text).toContain("/reset-password#token=");
    expect(mocks.close).toHaveBeenCalledOnce(); expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "SUCCEEDED" } }));
  });
  it.each([10, 50])("does not send when the daily cap has been consumed (%i)", async cap => {
    mocks.count.mockResolvedValue(cap); await send(); expect(mocks.send).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  });
  it("limits a recipient to three per day", async () => {
    mocks.count.mockResolvedValueOnce(1).mockResolvedValueOnce(3); await send(); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("fails closed on reservation error and does not leak details", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.transaction.mockRejectedValue(new Error("private-path-and-secret")); await send(); expect(mocks.send).not.toHaveBeenCalled(); expect(JSON.stringify(warn.mock.calls)).not.toContain("private-path-and-secret");
  });
  it("does not retry a failed delivery or refund its reservation", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {}); mocks.send.mockRejectedValue(new Error("SMTP private response")); await send();
    expect(mocks.create).toHaveBeenCalledOnce(); expect(mocks.send).toHaveBeenCalledOnce(); expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "FAILED" } })); expect(mocks.close).toHaveBeenCalledOnce();
  });
});
