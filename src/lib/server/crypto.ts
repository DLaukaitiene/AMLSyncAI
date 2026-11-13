import "server-only";
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

/** URL-safe random token with 256 bits of entropy. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function masterKey(): Buffer {
  const k = process.env.MASTER_KEY;
  if (!k) {
    if (process.env.NODE_ENV === "production") throw new Error("MASTER_KEY is not set");
    return Buffer.alloc(32, 7); // development only
  }
  const buf = Buffer.from(k, "base64");
  if (buf.length !== 32) throw new Error("MASTER_KEY must be 32 bytes, base64-encoded");
  return buf;
}

/**
 * Separate key per firm (spec §8C.6). Derived here from a master key with
 * HKDF; in production the master key lives in an EU-region KMS/HSM.
 */
function firmKey(firmId: string): Buffer {
  return Buffer.from(hkdfSync("sha256", masterKey(), Buffer.from(firmId), Buffer.from("amlsyncai-field-v1"), 32));
}

/** AES-256-GCM field-level encryption. Output: version(1) | iv(12) | tag(16) | ciphertext. */
export function encryptField(firmId: string, plaintext: string): Uint8Array<ArrayBuffer> {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", firmKey(firmId), iv);
  cipher.setAAD(Buffer.from(firmId));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return new Uint8Array(Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), ct]));
}

export function decryptField(firmId: string, blob: Uint8Array): string {
  const buf = Buffer.from(blob);
  if (buf[0] !== 1) throw new Error("Unknown ciphertext version");
  const iv = buf.subarray(1, 13);
  const tag = buf.subarray(13, 29);
  const decipher = createDecipheriv("aes-256-gcm", firmKey(firmId), iv);
  decipher.setAAD(Buffer.from(firmId));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(buf.subarray(29)), decipher.final()]).toString("utf8");
}
