/**
 * Maps a Didit session decision (GET /v3/session/{id}/decision/) to
 * AMLSync App records. Media URLs are presigned and short-lived: they are
 * downloaded into our own storage right away, never stored as links.
 */

type Obj = Record<string, unknown>;
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? (v as Obj[]) : []);
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

export interface MappedVerification {
  method: "EID" | "DOCUMENT_NFC_LIVENESS" | "DOCUMENT_LIVENESS";
  assuranceLevel: string;
  fallbackReason: string | null;
  status: string; // Didit feature status of the ID step
  extracted: {
    firstNames?: string; lastName?: string; birthDate?: string; placeOfBirth?: string; nationality?: string; issuingState?: string;
    documentType?: string; documentNumber?: string; personalNumber?: string; expirationDate?: string; address?: string;
  };
  liveness?: { status: string; score?: number; method?: string };
  faceMatch?: { status: string; score?: number };
  nfc?: { status: string; chipVerified: boolean; skipped: boolean };
  warnings: { feature: string; risk: string; text: string; level: string }[];
}

export interface MediaItem {
  kind: string; // idv-portrait | idv-document-front | ... (stored as Document.kind)
  url: string;
  fileName: string;
}

export interface AmlHitMapped {
  entityType: "person" | "company";
  caption: string;
  matchScore: number | null;
  riskScore: number | null;
  datasets: string[];
  sanctions: boolean;
  url?: string;
  providerReviewStatus?: string;
  properties?: unknown;
}

export interface MappedDecision {
  sessionStatus: string;
  verification: MappedVerification | null;
  media: MediaItem[];
  aml: { screened: boolean; datasetsUpdatedAt?: string; hits: AmlHitMapped[] };
}

const ISO3_TO_2: Record<string, string> = {
  AUT: "AT", BEL: "BE", BGR: "BG", HRV: "HR", CYP: "CY", CZE: "CZ", DNK: "DK", EST: "EE", FIN: "FI", FRA: "FR", DEU: "DE", GRC: "GR", HUN: "HU", IRL: "IE",
  ITA: "IT", LVA: "LV", LTU: "LT", LUX: "LU", MLT: "MT", NLD: "NL", POL: "PL", PRT: "PT", ROU: "RO", SVK: "SK", SVN: "SI", ESP: "ES", SWE: "SE",
  GBR: "GB", USA: "US", UKR: "UA", RUS: "RU", BLR: "BY", NOR: "NO", CHE: "CH", ISL: "IS", TUR: "TR", CHN: "CN", IND: "IN",
};
export const iso2 = (c?: string) => (c ? (c.length === 2 ? c.toUpperCase() : ISO3_TO_2[c.toUpperCase()] ?? c.toUpperCase()) : undefined);

export function isSanctionsDataset(d: string): boolean {
  return /sanction|ofac|consolidated|embargo|asset freeze|debarment/i.test(d);
}

export function mapDecision(decision: Obj): MappedDecision {
  const idv = arr(decision.id_verifications)[0];
  const nfc = arr(decision.nfc_verifications)[0];
  const live = arr(decision.liveness_checks)[0];
  const face = arr(decision.face_matches)[0];
  const media: MediaItem[] = [];
  const push = (kind: string, url: unknown, fileName: string) => {
    if (str(url)) media.push({ kind, url: url as string, fileName });
  };

  let verification: MappedVerification | null = null;
  if (idv) {
    const viaWallet = idv.verification_method === "wallet";
    const chipOk = !!nfc && nfc.status === "Approved" && !nfc.is_nfc_skipped;
    const method = viaWallet ? "EID" : chipOk ? "DOCUMENT_NFC_LIVENESS" : "DOCUMENT_LIVENESS";
    const fb = idv.fallback_from as Obj | null | undefined;
    verification = {
      method,
      assuranceLevel: viaWallet ? `eID wallet ${str(idv.wallet_provider) ?? ""} (${str(idv.assurance) ?? "cryptographic"})`.trim() : `${str(idv.assurance) ?? "documentary"}${chipOk ? " + chip" : ""}`,
      fallbackReason: viaWallet
        ? null
        : fb
          ? `Didit: ${str(fb.method) ?? "eID"} not completed (${str(fb.reason) ?? "no reason given"}); document check used`
          : chipOk
            ? "Client verified with document, chip read and liveness (no national eID used)"
            : `Client verified with document and liveness; chip ${nfc?.is_nfc_skipped ? `skipped (${str(nfc.skip_reason) ?? "no reason"})` : "not read"}`,
      status: str(idv.status) ?? "Unknown",
      extracted: {
        firstNames: str(idv.first_name), lastName: str(idv.last_name), birthDate: str(idv.date_of_birth), placeOfBirth: str(idv.place_of_birth),
        nationality: iso2(str(idv.nationality)), issuingState: iso2(str(idv.issuing_state)), documentType: str(idv.document_type),
        documentNumber: str(idv.document_number), personalNumber: str(idv.personal_number), expirationDate: str(idv.expiration_date),
        address: str(idv.formatted_address) ?? str(idv.address),
      },
      liveness: live ? { status: str(live.status) ?? "", score: live.score as number | undefined, method: str(live.method) } : undefined,
      faceMatch: face ? { status: str(face.status) ?? "", score: face.score as number | undefined } : undefined,
      nfc: nfc ? { status: str(nfc.status) ?? "", chipVerified: chipOk, skipped: !!nfc.is_nfc_skipped } : undefined,
      warnings: [idv, nfc, live, face].flatMap((x) => arr(x?.warnings)).map((w) => ({
        feature: str(w.feature) ?? "", risk: str(w.risk) ?? "", text: str(w.short_description) ?? "", level: str(w.log_type) ?? "",
      })),
    };
    push("idv-portrait", idv.portrait_image, "portrait.jpg");
    push("idv-document-front", idv.full_front_image ?? idv.front_image, "document-front.jpg");
    push("idv-document-back", idv.full_back_image ?? idv.back_image, "document-back.jpg");
    push("idv-document-video", idv.front_video, "document-front.mp4");
  }
  if (nfc) push("idv-chip-portrait", nfc.portrait_image, "chip-portrait.jpg");
  if (live) {
    push("idv-liveness-image", live.reference_image, "liveness-selfie.jpg");
    push("idv-liveness-video", live.video_url, "liveness-video.mp4");
  }
  if (face) push("idv-face-match-target", face.target_image, "face-match-live.jpg");

  const amls = arr(decision.aml_screenings);
  const hits: AmlHitMapped[] = amls.flatMap((a) =>
    arr(a.hits).map((h) => {
      const datasets = Array.isArray(h.datasets) ? (h.datasets as string[]) : [];
      return {
        entityType: a.entity_type === "company" ? "company" : "person",
        caption: str(h.caption) ?? "Unknown",
        matchScore: typeof h.match_score === "number" ? h.match_score : null,
        riskScore: typeof h.risk_score === "number" ? h.risk_score : null,
        datasets,
        sanctions: datasets.some(isSanctionsDataset),
        url: str(h.url),
        providerReviewStatus: str(h.review_status),
        properties: h.properties,
      };
    }),
  );
  return {
    sessionStatus: str(decision.status) ?? "Unknown",
    verification,
    media,
    aml: { screened: amls.length > 0, datasetsUpdatedAt: str(amls[0]?.last_ongoing_screening_datasets_updated_at), hits },
  };
}

/**
 * Our own auto-clear rule (competitor finding: hidden provider thresholds).
 * Didit tags hits under its match threshold as "False Positive"; we ignore
 * that tag. A hit is auto-cleared only when the firm has switched auto-clear
 * on, the hit is below the firm's threshold, and it is NOT a sanctions hit.
 */
export function autoClear(hit: AmlHitMapped, firmThreshold: number | null): { cleared: boolean; reason?: string } {
  if (hit.sanctions) return { cleared: false };
  if (firmThreshold === null || hit.matchScore === null) return { cleared: false };
  if (hit.matchScore < firmThreshold) {
    return { cleared: true, reason: `Auto-cleared: match score ${hit.matchScore} is below the firm's threshold ${firmThreshold} (non-sanctions list).` };
  }
  return { cleared: false };
}

export const CHECK_PRICE_CENTS = 300; // €3.00 per paid check (ID check or provider screening), excl. VAT
export const TRIAL_CREDIT_CENTS = 1500; // 5 checks for new firms
export const formatEur = (cents: number) => `€${(cents / 100).toFixed(2)}`;
