import "server-only";
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { Socket } from "node:net";
import path from "node:path";
import { checkUpload, containsEicar } from "@/lib/files/validate";
import type { Tx } from "./db";

/**
 * Document storage (spec §8C.5–8C.6): files are encrypted with the firm's key
 * (AES-256-GCM) before they are written, stored outside the web root, scanned
 * for malware, and only served through an authenticated route.
 * Driver: local directory (STORAGE_DIR). An EU-region object-storage driver
 * plugs in behind the same two functions.
 */
const DIR = path.resolve(process.env.STORAGE_DIR ?? ".data/files");

function fileKey(firmId: string): Buffer {
  const master = process.env.MASTER_KEY ? Buffer.from(process.env.MASTER_KEY, "base64") : Buffer.alloc(32, 7);
  return Buffer.from(hkdfSync("sha256", master, Buffer.from(firmId), Buffer.from("amlsyncai-file-v1"), 32));
}

async function writeBlob(firmId: string, key: string, bytes: Uint8Array) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", fileKey(firmId), iv);
  c.setAAD(Buffer.from(key));
  const ct = Buffer.concat([c.update(bytes), c.final()]);
  const p = path.join(DIR, key);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, Buffer.concat([iv, c.getAuthTag(), ct]), { mode: 0o600 });
}

export async function readBlob(firmId: string, key: string): Promise<Buffer> {
  const buf = await readFile(path.join(DIR, key));
  const d = createDecipheriv("aes-256-gcm", fileKey(firmId), buf.subarray(0, 12));
  d.setAAD(Buffer.from(key));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]);
}

export async function deleteBlob(key: string) {
  await unlink(path.join(DIR, key)).catch(() => {});
}

/** ClamAV over clamd's INSTREAM protocol. Returns "clean" | "quarantined", or null if unavailable. */
async function clamdScan(bytes: Uint8Array): Promise<"clean" | "quarantined" | null> {
  const host = process.env.CLAMD_HOST;
  if (!host) return null;
  const [h, port] = host.split(":");
  return new Promise((resolve) => {
    const sock = new Socket();
    let out = "";
    sock.setTimeout(20_000, () => { sock.destroy(); resolve(null); });
    sock.on("error", () => resolve(null));
    sock.connect(Number(port ?? 3310), h, () => {
      sock.write("zINSTREAM\0");
      for (let i = 0; i < bytes.length; i += 64 * 1024) {
        const chunk = bytes.subarray(i, i + 64 * 1024);
        const len = Buffer.alloc(4);
        len.writeUInt32BE(chunk.length);
        sock.write(len);
        sock.write(chunk);
      }
      sock.write(Buffer.alloc(4));
    });
    sock.on("data", (d) => (out += d.toString()));
    sock.on("end", () => resolve(out.includes("FOUND") ? "quarantined" : out.includes("OK") ? "clean" : null));
  });
}

/**
 * Scan result. Fails closed: without a scanner, files stay "pending" (never served)
 * unless SCAN_MODE=basic is set for development (EICAR check only).
 */
async function scan(bytes: Uint8Array): Promise<"clean" | "quarantined" | "pending"> {
  if (containsEicar(bytes)) return "quarantined";
  const clam = await clamdScan(bytes);
  if (clam) return clam;
  return process.env.SCAN_MODE === "basic" ? "clean" : "pending";
}

export type StoreResult = { ok: true; documentId: string; scan: string } | { ok: false; error: string };

export async function storeDocument(
  tx: Tx,
  d: { firmId: string; partyId: string | null; kind: string; fileName: string; bytes: Uint8Array; uploadedBy: string },
): Promise<StoreResult> {
  const check = checkUpload(d.fileName, d.bytes);
  if (!check.ok) return { ok: false, error: check.error! };
  const result = await scan(d.bytes);
  const key = `${d.firmId}/${randomUUID()}`;
  if (result !== "quarantined") await writeBlob(d.firmId, key, d.bytes); // quarantined bytes are never stored
  const doc = await tx.document.create({
    data: {
      firmId: d.firmId, partyId: d.partyId, kind: d.kind, storageKey: key, mimeType: check.type!, sizeBytes: d.bytes.length,
      sha256: createHash("sha256").update(d.bytes).digest("hex"), malwareScan: result, fileName: d.fileName.slice(0, 200), uploadedBy: d.uploadedBy,
    },
  });
  if (result === "quarantined") return { ok: false, error: "This file was blocked by the malware scan and has not been stored." };
  return { ok: true, documentId: doc.id, scan: result };
}

export const DOCUMENT_KINDS: Record<string, string> = {
  id: "Identity document",
  "proof-of-address": "Proof of address",
  "company-extract": "Company / BO register extract",
  "sof-evidence": "Source of funds evidence",
  "sow-evidence": "Source of wealth evidence",
  "power-of-attorney": "Power of attorney",
  other: "Other",
};
