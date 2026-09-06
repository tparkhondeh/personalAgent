import { describe, expect, it } from "vitest";
import { publicWebPushConfig, readWebPushConfig } from "./push-config";

describe("runtime web push configuration", () => {
  it("remains local until all server configuration is present", () => {
    expect(publicWebPushConfig({})).toEqual({ publicKey: null });
    expect(publicWebPushConfig({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: "public" })).toEqual({ publicKey: null });
  });

  it("reflects runtime changes and exposes only the public key", () => {
    const env = { NEXT_PUBLIC_VAPID_PUBLIC_KEY: "public", VAPID_PRIVATE_KEY: "private-test-value", VAPID_SUBJECT: "mailto:test@example.invalid" };
    expect(readWebPushConfig(env)?.privateKey).toBe("private-test-value");
    expect(publicWebPushConfig(env)).toEqual({ publicKey: "public" });
    env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "rotated-public";
    expect(publicWebPushConfig(env)).toEqual({ publicKey: "rotated-public" });
  });
});
