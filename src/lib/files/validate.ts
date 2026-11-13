/**
 * Upload rules (spec §8C.5): type allow-list checked by content (magic bytes),
 * not just the file name; size limit; malware scanning before anyone can open
 * the file.
 */

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export type AllowedType = "application/pdf" | "image/jpeg" | "image/png" | "image/heic" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const EXT: Record<AllowedType, string[]> = {
  "application/pdf": ["pdf"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/heic": ["heic", "heif"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
};

function startsWith(b: Uint8Array, sig: number[], offset = 0) {
  return sig.every((v, i) => b[offset + i] === v);
}

/** Detects the real file type from its first bytes. */
export function sniffType(b: Uint8Array): AllowedType | null {
  if (startsWith(b, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // %PDF-
  if (startsWith(b, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  // ISO BMFF: ....ftypheic / heix / mif1 / msf1
  if (startsWith(b, [0x66, 0x74, 0x79, 0x70], 4)) {
    const brand = String.fromCharCode(...b.slice(8, 12));
    if (["heic", "heix", "hevc", "heim", "heis", "mif1", "msf1"].includes(brand)) return "image/heic";
  }
  // DOCX = ZIP containing word/ — check ZIP header and the "word/" entry name nearby.
  if (startsWith(b, [0x50, 0x4b, 0x03, 0x04])) {
    const head = new TextDecoder("latin1").decode(b.slice(0, Math.min(b.length, 64 * 1024)));
    if (head.includes("word/") || head.includes("[Content_Types].xml")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return null;
}

export interface UploadCheck {
  ok: boolean;
  type?: AllowedType;
  error?: string;
}

export function checkUpload(fileName: string, bytes: Uint8Array): UploadCheck {
  if (bytes.length === 0) return { ok: false, error: "The file is empty." };
  if (bytes.length > MAX_UPLOAD_BYTES) return { ok: false, error: `Files can be at most ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.` };
  const type = sniffType(bytes);
  if (!type) return { ok: false, error: "Only PDF, JPG, PNG, HEIC and DOCX files are accepted." };
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (!EXT[type].includes(ext)) return { ok: false, error: `The file content doesn't match its name (.${ext}). Upload the original file.` };
  return { ok: true, type };
}

/** The EICAR anti-virus test string — always treated as malware (spec §11.14 test). */
const EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

export function containsEicar(bytes: Uint8Array): boolean {
  return new TextDecoder("latin1").decode(bytes).includes(EICAR);
}

/** Safe file name for Content-Disposition: letters, digits, dot, dash, underscore. */
export function safeFileName(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "");
  return base.slice(-100) || "file";
}
