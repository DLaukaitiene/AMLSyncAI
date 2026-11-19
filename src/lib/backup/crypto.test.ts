import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { backupKey, openBackup, sealBackup } from "./crypto";

describe("backup encryption", () => {
  const key = randomBytes(32);
  it("round-trips", () => {
    const json = JSON.stringify({ tables: { Firm: [{ id: "x", name: "Ūkis UAB" }] } });
    expect(openBackup(sealBackup(json, key), key)).toBe(json);
  });
  it("wrong key or tampered file is rejected", () => {
    const f = sealBackup("{}", key);
    expect(() => openBackup(f, randomBytes(32))).toThrow();
    const t = Buffer.from(f); t[t.length - 1] ^= 1;
    expect(() => openBackup(t, key)).toThrow();
  });
  it("needs a 32-byte key", () => {
    expect(() => backupKey("")).toThrow(/BACKUP_KEY/);
    expect(backupKey(key.toString("base64")).length).toBe(32);
  });
});
