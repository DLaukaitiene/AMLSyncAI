import "server-only";
import type { Tx } from "./db";
import { EU_CODES } from "@/lib/geo/countries";
import { EU_HIGH_RISK_THIRD_COUNTRIES } from "@/lib/rules/high-risk-countries";

/** A suggested answer for a risk-assessment question, and why. */
export type Suggestion = { value: number; why: string };

const share = (n: number, total: number) => (n === 0 ? 0 : n / total < 0.1 ? 1 : n / total <= 0.3 ? 2 : 3); // None / <10% / 10–30% / >30%
const count = (n: number) => (n === 0 ? 0 : n <= 2 ? 1 : n <= 5 ? 2 : 3); // None / one or two (a few) / several (some) / many
const pct = (n: number, total: number) => `${n} of ${total} client${total === 1 ? "" : "s"}`;

/**
 * Answers the app can suggest from data it already has: your clients (sample data ignored) and your firm profile.
 * The person sees them pre-selected and marked "Suggested", and can change them before saving [28 Nov 2026].
 */
export async function suggestRiskAnswers(tx: Tx, firmId: string): Promise<Record<string, Suggestion>> {
  const out: Record<string, Suggestion> = {};
  const firm = await tx.firm.findUniqueOrThrow({ where: { id: firmId }, select: { usesCash: true, crossBorderPct: true } });
  if (firm.crossBorderPct != null) {
    const p = firm.crossBorderPct;
    out["g-crossborder"] = { value: p < 10 ? 0 : p <= 30 ? 1 : p <= 60 ? 2 : 3, why: `Your firm profile says ${p}% of your business is cross-border.` };
  }
  if (!firm.usesCash) out["p-cash"] = { value: 0, why: "Your firm profile says you don't accept cash." };

  const files = await tx.cddFile.findMany({
    where: { role: "CLIENT", status: { notIn: ["REFUSED", "TERMINATED"] } },
    select: { party: { select: { id: true, kind: true, details: true, ownedBy: { select: { owner: { select: { kind: true, details: true } } } } } } },
  });
  const clients = files.map((f) => f.party).filter((p) => !(p.details as { sample?: boolean } | null)?.sample);
  const total = clients.length;
  if (!total) return out;
  const d = (x: unknown) => (x ?? {}) as { isPep?: boolean; residenceCountry?: string; countryOfCreation?: string; nationalities?: string[] };
  const countries = (x: unknown) => { const v = d(x); return [v.residenceCountry, v.countryOfCreation, ...(v.nationalities ?? [])].filter((c): c is string => !!c).map((c) => c.toUpperCase()); };
  const home = (p: (typeof clients)[number]) => (p.kind === "NATURAL" ? d(p.details).residenceCountry : d(p.details).countryOfCreation)?.toUpperCase();

  const peps = clients.filter((p) => d(p.details).isPep).length;
  out["c-pep"] = { value: count(peps), why: `${peps ? pct(peps, total) : "None of your " + total + " clients"} marked as a PEP in the app.` };

  const known = clients.filter((p) => home(p));
  if (known.length) {
    const outside = known.filter((p) => !EU_CODES.includes(home(p)!)).length;
    out["c-nonresident"] = { value: share(outside, known.length), why: `${outside} of ${known.length} clients with a known country live or are registered outside the EU.` };
  }
  const companies = clients.filter((p) => p.kind !== "NATURAL");
  const layered = companies.filter((p) => p.ownedBy.some((l) => l.owner.kind !== "NATURAL")).length;
  out["c-structures"] = { value: share(layered, total), why: `${layered ? pct(layered, total) : "None of your " + total + " clients"} owned through another company, trust or foundation.` };

  const all = (p: (typeof clients)[number]) => [...countries(p.details), ...p.ownedBy.flatMap((l) => countries(l.owner.details))];
  const ruby = clients.filter((p) => all(p).some((c) => c === "RU" || c === "BY")).length;
  out["g-ru-by"] = { value: count(ruby), why: `${ruby ? pct(ruby, total) : "None of your " + total + " clients"} (or their owners) linked to Russia or Belarus.` };
  const hr = EU_HIGH_RISK_THIRD_COUNTRIES;
  const highRisk = clients.filter((p) => all(p).some((c) => hr.has(c))).length;
  out["g-highrisk"] = { value: highRisk === 0 ? 0 : highRisk <= 2 ? 2 : 3, why: `${highRisk ? pct(highRisk, total) : "None of your " + total + " clients"} (or their owners) linked to an EU high-risk country.` };
  return out;
}
