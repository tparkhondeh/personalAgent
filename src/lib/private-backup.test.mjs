import { describe, expect, it } from "vitest";
import { sealBackup, openBackup } from "../../scripts/private-backup.mjs";
const secret = Buffer.from("synthetic-test-only-not-an-operational-key");
describe("offline authenticated backups", () => {
  it("round-trips exact bytes without including plaintext", async () => {
    const data = Buffer.from("SQLite format 3\0داده کاملاً ساختگی");
    const encrypted = await sealBackup(data, secret);
    expect(encrypted.includes(data)).toBe(false);
    expect(await openBackup(encrypted, secret)).toEqual(data);
    expect(await sealBackup(data, secret)).not.toEqual(encrypted);
  });
  it("rejects wrong passwords", async () => {
    const encrypted = await sealBackup(Buffer.from("synthetic"), secret);
    await expect(openBackup(encrypted, Buffer.from("another-synthetic-test-only-secret"))).rejects.toThrow("verification failed");
  });
  it.each([0, 12, 45, 52, 60, 74])("authenticates modified byte %i", async offset => {
    const encrypted = await sealBackup(Buffer.from("synthetic-plaintext"), secret);
    encrypted[offset] ^= 1;
    await expect(openBackup(encrypted, secret)).rejects.toThrow();
  });
  it("rejects truncated, empty and weak-secret inputs", async () => {
    await expect(openBackup(Buffer.from("TIABKP01"), secret)).rejects.toThrow();
    await expect(sealBackup(Buffer.alloc(0), secret)).rejects.toThrow();
    await expect(sealBackup(Buffer.from("synthetic"), Buffer.from("weak"))).rejects.toThrow();
  });
});
