import { describe, expect, it } from "vitest";
import { checkUpload, containsEicar, safeFileName, sniffType } from "./validate";

const bytes = (...xs: (number | string)[]) =>
  new Uint8Array(xs.flatMap((x) => (typeof x === "string" ? [...Buffer.from(x, "latin1")] : [x])));

describe("upload checks (§8C.5, §11.14)", () => {
  it("detects types by content", () => {
    expect(sniffType(bytes("%PDF-1.7\n"))).toBe("application/pdf");
    expect(sniffType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffType(bytes(0x89, "PNG\r\n", 0x1a, "\n"))).toBe("image/png");
    expect(sniffType(bytes(0, 0, 0, 0x18, "ftypheic"))).toBe("image/heic");
    expect(sniffType(bytes("PK", 3, 4, "....[Content_Types].xml word/document.xml"))).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(sniffType(bytes("MZ\x90\x00"))).toBeNull();
  });

  it("refuses disallowed types, renamed files, empty and oversized files", () => {
    expect(checkUpload("virus.exe", bytes("MZ\x90\x00")).ok).toBe(false);
    expect(checkUpload("passport.pdf", bytes("MZ\x90\x00")).error).toMatch(/Only PDF/);
    expect(checkUpload("photo.pdf", bytes(0xff, 0xd8, 0xff, 0xe0)).error).toMatch(/doesn't match/);
    expect(checkUpload("a.pdf", new Uint8Array()).ok).toBe(false);
    expect(checkUpload("a.pdf", new Uint8Array(16 * 1024 * 1024)).ok).toBe(false);
    expect(checkUpload("id.JPG", bytes(0xff, 0xd8, 0xff, 0xe0))).toEqual({ ok: true, type: "image/jpeg" });
  });

  it("detects the EICAR test signature", () => {
    expect(containsEicar(bytes("%PDF-1.4 X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"))).toBe(true);
    expect(containsEicar(bytes("%PDF-1.4 hello"))).toBe(false);
  });

  it("makes safe download names", () => {
    expect(safeFileName("../../Pasas Jonaitė (1).pdf")).toBe("Pasas_Jonaite_1_.pdf");
    expect(safeFileName("..\\x\\.env")).toBe("env");
  });
});
