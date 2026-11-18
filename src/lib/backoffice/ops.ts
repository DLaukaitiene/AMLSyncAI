/** Pure rules for leads, tickets, VIES and announcements (Backoffice §7.3, §9.3, §16, §18). */

const FREE_MAIL = /@(gmail|googlemail|yahoo|hotmail|outlook|live|icloud|me|gmx|web|mail|proton|protonmail|yandex|inbox|one)\.[a-z.]+$/i;
const EU = new Set(["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"]);

export interface LeadInput { email: string; company?: string | null; country?: string | null; need?: string | null; message?: string | null; source: string; stage: string; pageviews?: number; createdAt: Date }

/** Lead score 0–100 with reasons: fit (company email, EU, need) + intent (source, engagement) + recency. */
export function leadScore(l: LeadInput, now = new Date()): { score: number; reasons: string[] } {
  const r: [number, string][] = [];
  if (!FREE_MAIL.test(l.email)) r.push([15, "company email"]);
  if (l.company) r.push([5, "company given"]);
  if (l.country && EU.has(l.country.toUpperCase())) r.push([10, "EU country"]);
  if (/app|software/i.test(l.need ?? "")) r.push([20, "wants the AMLSync App"]);
  else if (l.need && !/not sure/i.test(l.need)) r.push([10, "named a service"]);
  if (l.source === "unfinished-signup") r.push([25, "started sign-up"]);
  if (l.source === "website-form") r.push([15, "sent the contact form"]);
  if ((l.message ?? "").length > 120) r.push([5, "detailed message"]);
  if ((l.pageviews ?? 0) >= 5) r.push([10, `${l.pageviews} page views`]);
  const days = (now.getTime() - l.createdAt.getTime()) / 86_400_000;
  if (days <= 7) r.push([10, "last 7 days"]);
  if (l.stage === "lost") return { score: 0, reasons: ["lost"] };
  return { score: Math.min(100, r.reduce((s, [n]) => s + n, 0)), reasons: r.map(([, t]) => t) };
}

export const LEAD_STAGES = ["new", "contacted", "demo", "trial", "customer", "lost"] as const;

/** First-response targets (§16): P1 1 h, P2 4 h, P3 next business day (Mon–Fri, UTC). */
export function slaDue(priority: string, from: Date): Date {
  if (priority === "P1") return new Date(from.getTime() + 3600_000);
  if (priority === "P2") return new Date(from.getTime() + 4 * 3600_000);
  const d = new Date(from.getTime() + 24 * 3600_000);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

export function ticketPriority(category: string, blocking: boolean): "P1" | "P2" | "P3" {
  if (blocking) return "P1";
  return category === "technical" || category === "account" ? "P2" : "P3";
}

/** Splits a VAT ID for VIES: country prefix (Greece is EL) and number. */
export function splitVatId(vatId: string): { cc: string; number: string } | null {
  const v = vatId.replace(/[\s.-]/g, "").toUpperCase();
  const m = /^([A-Z]{2})([0-9A-Z]{2,13})$/.exec(v);
  if (!m) return null;
  const cc = m[1] === "GR" ? "EL" : m[1];
  return EU.has(cc === "EL" ? "GR" : cc) || cc === "EL" ? { cc, number: m[2] } : null;
}

export function parseVies(json: unknown): { status: "valid" | "invalid" | "unavailable"; name: string | null } {
  const j = (json ?? {}) as { isValid?: boolean; valid?: boolean; name?: string; userError?: string };
  const valid = j.isValid ?? j.valid;
  if (typeof valid !== "boolean" || (j.userError && !/^VALID$|^INVALID$/.test(j.userError))) return { status: "unavailable", name: null };
  const name = j.name && j.name !== "---" ? j.name.trim() : null;
  return { status: valid ? "valid" : "invalid", name };
}

export interface Audience { country?: string; plan?: string; status?: string; sector?: string }

export function inAudience(a: Audience, f: { homeState: string; plan: string; status: string; sectors: string[] }): boolean {
  if (a.country && a.country.toUpperCase() !== f.homeState) return false;
  if (a.plan && a.plan !== f.plan) return false;
  if (a.status && a.status !== f.status) return false;
  if (a.sector && !f.sectors.includes(a.sector)) return false;
  return true;
}

export const isAllFirms = (a: Audience) => !a.country && !a.plan && !a.status && !a.sector;
