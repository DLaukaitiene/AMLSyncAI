import "server-only";
import { adminDb } from "./db";
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { Socket } from "node:net";
import path from "node:path";
import { checkUpload, containsEicar } from "@/lib/files/validate";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import type { Tx } from "./db";

/**
 * Document storage (spec §8C.5–8C.6): files are encrypted with the firm's key
 * (AES-256-GCM) before they are written, stored outside the web root, scanned
 * for malware, and only served through an authenticated route.
 * Drivers (STORAGE_DRIVER):
 *  - "local" (default): a directory outside the web root (STORAGE_DIR)
 *  - "db": the Blob table (owner connection only), for serverless test environments
 *  - "s3": any S3-compatible EU bucket — e.g. Supabase Storage's S3 endpoint
 *    (S3_ENDPOINT=https://<project>.supabase.co/storage/v1/s3, S3_REGION,
 *    S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY). Objects are already
 *    encrypted with the firm key before they leave the server; the bucket
 *    must be private.
 */
const DIR = path.resolve(process.env.STORAGE_DIR ?? ".data/files");
const s3Enabled = () => process.env.STORAGE_DRIVER === "s3";
const dbEnabled = () => process.env.STORAGE_DRIVER === "db";
let s3: S3Client | null = null;
function s3Client() {
  s3 ??= new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? "eu-central-1",
    forcePathStyle: true,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "", secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "" },
  });
  return s3;
}
const bucket = () => process.env.S3_BUCKET ?? "amlsyncai-documents";

async function putBytes(key: string, data: Buffer) {
  if (dbEnabled()) {
    const bytes = new Uint8Array(data);
    await adminDb.blob.upsert({ where: { key }, create: { key, data: bytes }, update: { data: bytes } });
    return;
  }
  if (s3Enabled()) {
    await s3Client().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: data, ContentType: "application/octet-stream" }));
    return;
  }
  const p = path.join(DIR, key);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, data, { mode: 0o600 });
}

async function getBytes(key: string): Promise<Buffer> {
  if (dbEnabled()) return Buffer.from((await adminDb.blob.findUniqueOrThrow({ where: { key } })).data);
  if (s3Enabled()) {
    const r = await s3Client().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
    return Buffer.from(await r.Body!.transformToByteArray());
  }
  return readFile(path.join(DIR, key));
}

function fileKey(firmId: string): Buffer {
  const master = process.env.MASTER_KEY ? Buffer.from(process.env.MASTER_KEY, "base64") : Buffer.alloc(32, 7);
  return Buffer.from(hkdfSync("sha256", master, Buffer.from(firmId), Buffer.from("amlsyncai-file-v1"), 32));
}

async function writeBlob(firmId: string, key: string, bytes: Uint8Array) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", fileKey(firmId), iv);
  c.setAAD(Buffer.from(key));
  const ct = Buffer.concat([c.update(bytes), c.final()]);
  await putBytes(key, Buffer.concat([iv, c.getAuthTag(), ct]));
}

export async function readBlob(firmId: string, key: string): Promise<Buffer> {
  const buf = await getBytes(key);
  const d = createDecipheriv("aes-256-gcm", fileKey(firmId), buf.subarray(0, 12));
  d.setAAD(Buffer.from(key));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]);
}

/** Copies a firm's file to another firm, re-encrypted with the receiving firm's key (client sharing). */
export async function copyBlobToFirm(fromFirmId: string, key: string, toFirmId: string): Promise<string> {
  const bytes = await readBlob(fromFirmId, key);
  const newKey = `${toFirmId}/${randomUUID()}`;
  await writeBlob(toFirmId, newKey, bytes);
  return newKey;
}

export async function deleteBlob(key: string) {
  if (dbEnabled()) {
    await adminDb.blob.deleteMany({ where: { key } });
    return;
  }
  if (s3Enabled()) {
    await s3Client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key })).catch(() => {});
    return;
  }
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
  d: { firmId: string; partyId: string | null; kind: string; fileName: string; bytes: Uint8Array; uploadedBy: string; providerMedia?: boolean },
): Promise<StoreResult> {
  const check = checkUpload(d.fileName, d.bytes, { providerMedia: d.providerMedia });
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
  articles: "Articles of association / founding documents",
  "shareholder-register": "Shareholder register",
  "sof-evidence": "Source of funds evidence",
  "sow-evidence": "Source of wealth evidence",
  "power-of-attorney": "Power of attorney",
  other: "Other",
  "idv-portrait": "ID check: document portrait",
  "idv-document-front": "ID check: document front",
  "idv-document-back": "ID check: document back",
  "idv-document-video": "ID check: document capture video",
  "idv-chip-portrait": "ID check: chip portrait (NFC)",
  "idv-liveness-image": "ID check: liveness selfie",
  "idv-liveness-video": "ID check: liveness video",
  "idv-face-match-target": "ID check: face match image",
  "idv-report": "ID check: provider report (PDF)",
  "firm:approvals": "Approvals & Sign-offs",
  "firm:audit": "Audit & Reviews",
  "firm:authority": "FIU & Supervisor Correspondence",
  "firm:other": "Other",
};
/** Firm document library folders (Compliance Hub → My Firm Compliance). */
export const FIRM_FOLDERS = [
  { kind: "firm:approvals", label: "Approvals & Sign-offs", hint: "Management approval of the AML Program and risk assessment, sign-off minutes", restricted: false },
  { kind: "firm:audit", label: "Audit & Reviews", hint: "Independent audit reports (Art. 8(4)(b)), internal reviews and follow-up", restricted: false },
  { kind: "firm:authority", label: "FIU & Supervisor Correspondence", hint: "Letters, requests, inspection notices and your replies", restricted: true },
  { kind: "firm:other", label: "Other", hint: "Anything else that supports your program", restricted: false },
] as const;
