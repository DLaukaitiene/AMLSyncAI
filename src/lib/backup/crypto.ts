import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";

/**
 * Backup file format: "AMLSBK01" | 12-byte IV | 16-byte GCM tag | AES-256-GCM(gzip(JSON)).
 * The key (BACKUP_KEY, 32 bytes base64) is kept outside the database: without it a
 * backup can't be read, so a leaked backup file alone reveals nothing.
 */
const MAGIC = Buffer.from("AMLSBK01");

export function backupKey(raw = process.env.BACKUP_KEY): Buffer {
  const k = raw ? Buffer.from(raw, "base64") : Buffer.alloc(0);
  if (k.length !== 32) throw new Error("BACKUP_KEY is not set (32 bytes, base64).");
  return k;
}

export function sealBackup(json: string, key: Buffer): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(MAGIC);
  const body = Buffer.concat([c.update(gzipSync(Buffer.from(json, "utf8"), { level: 9 })), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), body]);
}

export function openBackup(file: Buffer, key: Buffer): string {
  if (!file.subarray(0, 8).equals(MAGIC)) throw new Error("Not an AMLSync backup file.");
  const d = createDecipheriv("aes-256-gcm", key, file.subarray(8, 20));
  d.setAAD(MAGIC);
  d.setAuthTag(file.subarray(20, 36));
  return gunzipSync(Buffer.concat([d.update(file.subarray(36)), d.final()])).toString("utf8");
}
