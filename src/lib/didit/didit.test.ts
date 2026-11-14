import { describe, expect, it } from "vitest";
import { canonicalJson, signV2, verifyDiditWebhook } from "./signature";
import { autoClear, mapDecision } from "./map";

describe("Didit webhook signature (X-Signature-V2)", () => {
  const body = { webhook_type: "status.updated", session_id: "s1", status: "Approved", timestamp: 1774970000, decision: { name: "Jonaitė Ž", score: 87.5, n: 100 } };
  it("canonicalises with sorted keys and unescaped Unicode", () => {
    expect(canonicalJson({ b: 1, a: { d: "Ž", c: 2 } })).toBe('{"a":{"c":2,"d":"Ž"},"b":1}');
  });
  it("accepts a valid signature, also the previous secret's; rejects stale, tampered and unsigned", () => {
    const sig = signV2(body, "secret");
    const now = 1774970000;
    expect(verifyDiditWebhook(body, { signatureV2: sig, timestamp: "1774970000" }, "secret", now).ok).toBe(true);
    expect(verifyDiditWebhook(body, { signatureV2: "x".repeat(64), signatureV2Previous: sig, timestamp: "1774970000" }, "secret", now).ok).toBe(true);
    expect(verifyDiditWebhook(body, { signatureV2: sig, timestamp: "1774970000" }, "secret", now + 301).reason).toBe("stale-or-missing-timestamp");
    expect(verifyDiditWebhook({ ...body, status: "Declined" }, { signatureV2: sig, timestamp: "1774970000" }, "secret", now).reason).toBe("bad-signature");
    expect(verifyDiditWebhook(body, { timestamp: "1774970000" }, "secret", now).reason).toBe("missing-signature");
  });
});

const decision = {
  status: "Approved",
  id_verifications: [{
    status: "Approved", verification_method: "document", assurance: "documentary", document_type: "Identity Card", document_number: "AB123",
    personal_number: "38503141234", first_name: "Rūta", last_name: "Klientė", date_of_birth: "1985-03-14", nationality: "LTU", issuing_state: "LTU",
    portrait_image: "https://m/p.jpg", full_front_image: "https://m/f.jpg", back_image: "https://m/b.jpg", warnings: [],
  }],
  nfc_verifications: [{ status: "Approved", is_nfc_skipped: false, portrait_image: "https://m/chip.jpg" }],
  liveness_checks: [{ status: "Approved", score: 96.2, method: "ACTIVE_3D", reference_image: "https://m/l.jpg", video_url: "https://m/l.mp4" }],
  face_matches: [{ status: "Approved", score: 91, target_image: "https://m/t.jpg" }],
  aml_screenings: [{ entity_type: "person", hits: [
    { caption: "Ruta Kliente", match_score: 72, risk_score: 40, datasets: ["PEP Level 2"], review_status: "False Positive" },
    { caption: "R. Kliente", match_score: 60, risk_score: 90, datasets: ["EU Consolidated Sanctions"], review_status: "False Positive" },
  ] }],
};

describe("Didit decision mapping", () => {
  const m = mapDecision(decision);
  it("maps a document + chip + liveness check to the right method, with the reason recorded", () => {
    expect(m.verification).toMatchObject({ method: "DOCUMENT_NFC_LIVENESS", status: "Approved", extracted: { nationality: "LT", personalNumber: "38503141234", firstNames: "Rūta" } });
    expect(m.verification!.fallbackReason).toMatch(/no national eID/);
  });
  it("collects every image and video for download", () => {
    expect(m.media.map((x) => x.kind)).toEqual(["idv-portrait", "idv-document-front", "idv-document-back", "idv-chip-portrait", "idv-liveness-image", "idv-liveness-video", "idv-face-match-target"]);
  });
  it("an eID wallet is EID with no fallback reason", () => {
    const w = mapDecision({ status: "Approved", id_verifications: [{ status: "Approved", verification_method: "wallet", wallet_provider: "smartid", assurance: "cryptographic" }] });
    expect(w.verification).toMatchObject({ method: "EID", fallbackReason: null });
  });
  it("ignores Didit's own False Positive tags; auto-clear only by firm threshold and never for sanctions", () => {
    const [pep, sanc] = m.aml.hits;
    expect(pep.sanctions).toBe(false);
    expect(sanc.sanctions).toBe(true);
    expect(autoClear(pep, null).cleared).toBe(false);
    expect(autoClear(pep, 80)).toMatchObject({ cleared: true });
    expect(autoClear(sanc, 80).cleared).toBe(false);
  });
});
