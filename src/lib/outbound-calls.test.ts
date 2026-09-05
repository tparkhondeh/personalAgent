import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getVoiceCallReadiness, normalizeIranianMobile, sendUrgentVoiceCall } from "./outbound-calls";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("outbound voice calls", () => {
  it("normalizes common Iranian mobile formats", () => {
    expect(normalizeIranianMobile("+98 912 123 4567")).toBe("09121234567");
    expect(normalizeIranianMobile("۹۱۲۱۲۳۴۵۶۷")).toBe("09121234567");
    expect(normalizeIranianMobile("021-12345678")).toBeNull();
  });

  it("stays in mock mode unless live delivery is explicitly enabled", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(getVoiceCallReadiness("09121234567").reason).toBe("delivery-disabled");
    expect(await sendUrgentVoiceCall("09121234567")).toMatchObject({ mode: "mock", transmitted: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a recipient that is not on the server-side verified list", async () => {
    vi.stubEnv("OUTBOUND_CALLS_MODE", "live");
    vi.stubEnv("KAVENEGAR_API_KEY", "test-key");
    vi.stubEnv("OUTBOUND_CALL_VERIFIED_NUMBERS", "09121111111");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect((await sendUrgentVoiceCall("09122222222")).reason).toBe("recipient-not-verified");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends only a generic alert after all live safeguards pass", async () => {
    vi.stubEnv("OUTBOUND_CALLS_MODE", "live");
    vi.stubEnv("KAVENEGAR_API_KEY", "test-key");
    vi.stubEnv("OUTBOUND_CALL_VERIFIED_NUMBERS", "+989121234567");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ return: { status: 200 }, entries: [{ messageid: 123 }] }), { status: 200 }));
    const result = await sendUrgentVoiceCall("09121234567");
    expect(result).toMatchObject({ mode: "live", provider: "kavenegar", transmitted: true, providerReference: "123" });
    const requestBody = fetchSpy.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(requestBody.get("receptor")).toBe("09121234567");
    expect(requestBody.get("message")).toContain("برنامه همراه");
  });
});
