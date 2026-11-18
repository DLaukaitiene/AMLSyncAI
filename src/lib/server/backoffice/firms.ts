import "server-only";
import { adminDb } from "../db";
import { firmMetrics, type FirmMetrics } from "./metrics";
import { planOf } from "@/lib/billing/plans";

export interface FirmFilter { q?: string; status?: string; plan?: string; country?: string; sector?: string; view?: string }

export const SAVED_VIEWS: { id: string; label: string }[] = [
  { id: "trial-ending", label: "Trials ending in 7 days" },
  { id: "no-first-check", label: "No first client after 3 days" },
  { id: "budget-low", label: "Paid-check budget > 90% used" },
  { id: "red", label: "Red health" },
  { id: "kyb", label: "KYB to review" },
  { id: "inactive", label: "No sign-in for 30 days" },
];

export type FirmRow = Awaited<ReturnType<typeof listFirms>>[number];

/** Firm list (§6.1): metadata and counts per firm. */
export async function listFirms(f: FirmFilter) {
  const q = f.q?.trim();
  const firms = await adminDb.firm.findMany({
    where: {
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { emailDomain: { contains: q.toLowerCase() } }, { vatId: { contains: q, mode: "insensitive" } }, { billingCompanyCode: { contains: q } }] } : {}),
      ...(f.status && f.status !== "trial" ? { status: f.status } : {}),
      ...(f.plan ? { plan: f.plan } : {}),
      ...(f.country ? { homeState: f.country.toUpperCase() } : {}),
      ...(f.sector ? { sectors: { has: f.sector as never } } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, emailDomain: true, homeState: true, sectors: true, plan: true, status: true, trialEndsOn: true, createdAt: true, vatId: true, billingCompanyCode: true, spendLimitCents: true, customFeeCents: true },
  });
  const ids = firms.map((x) => x.id);
  const [metrics, meta, kyb] = await Promise.all([
    firmMetrics(ids),
    adminDb.firmAdminMeta.findMany({ where: { firmId: { in: ids } } }),
    adminDb.firmKyb.findMany({ where: { firmId: { in: ids } }, orderBy: { checkedAt: "desc" }, distinct: ["firmId"], select: { firmId: true, result: true, decision: true, checkedAt: true } }),
  ]);
  const metaBy = new Map(meta.map((m) => [m.firmId, m]));
  const kybBy = new Map(kyb.map((k) => [k.firmId, k]));
  const today = new Date().toISOString().slice(0, 10);
  const in7 = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const rows = firms.map((x) => {
    const m = metrics.get(x.id)!;
    const k = kybBy.get(x.id);
    const inTrial = !!x.trialEndsOn && x.trialEndsOn >= today;
    return {
      ...x, m, meta: metaBy.get(x.id) ?? null, kyb: k ?? null,
      displayStatus: x.status === "active" && inTrial ? "trial" : x.status,
      planName: planOf(x.plan).name,
      kybLabel: !k ? "not checked" : k.decision === "cleared" ? "cleared" : k.result,
    };
  });
  return rows.filter((r) => {
    if (f.status === "trial" && r.displayStatus !== "trial") return false;
    switch (f.view) {
      case "trial-ending": return r.displayStatus === "trial" && r.trialEndsOn! <= in7;
      case "no-first-check": return r.m.clients === 0 && Date.now() - r.createdAt.getTime() > 3 * 86_400_000;
      case "budget-low": return r.m.spendMonthCents > 0.9 * r.spendLimitCents;
      case "red": return r.m.health.band === "red";
      case "kyb": return !r.kyb || (r.kyb.result === "possible-match" && !r.kyb.decision);
      case "inactive": return !r.m.lastLogin || Date.now() - r.m.lastLogin.getTime() > 30 * 86_400_000;
      default: return true;
    }
  });
}

export function firmsCsv(rows: FirmRow[]): string {
  const head = ["id", "name", "email_domain", "country", "sectors", "plan", "status", "signed_up", "users", "active_users_30d", "clients", "screenings_30d", "paid_checks_month", "spend_month_eur", "health", "last_login", "kyb", "tags"];
  const esc = (v: unknown) => { const s = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" : "") + s.replace(/"/g, '""')}"` : s; };
  const lines = rows.map((r: FirmRow & { m: FirmMetrics }) => [r.id, r.name, r.emailDomain, r.homeState, r.sectors.join(" "), r.plan, r.displayStatus, r.createdAt.toISOString().slice(0, 10), r.m.users, r.m.activeUsers30d, r.m.clients, r.m.screenings30d, r.m.paidChecksMonth, (r.m.spendMonthCents / 100).toFixed(2), r.m.health.score, r.m.lastLogin?.toISOString().slice(0, 10) ?? "", r.kybLabel, r.meta?.tags.join(" ") ?? ""].map(esc).join(","));
  return [head.join(","), ...lines].join("\n") + "\n";
}
