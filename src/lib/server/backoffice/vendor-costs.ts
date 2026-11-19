import "server-only";
import { adminDb } from "../db";
import { KYB_FULL_PRICE_CENTS } from "@/lib/didit/map";

/** Vendor cost and margin per check type (§9.5). Counts only; live (non-sandbox) sessions. */
export const CHECK_TYPES = [
  { id: "idv", label: "Identity check" },
  { id: "aml", label: "Provider AML screening" },
  { id: "kyb-lite", label: "Company register: company and status" },
  { id: "kyb-full", label: "Company register: full ownership" },
] as const;

export async function marginByMonth(months = 6) {
  const now = new Date();
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months + 1, 1));
  const [rows, prices, invoices] = await Promise.all([
    adminDb.$queryRaw<{ m: Date; kind: string; price: number; n: bigint }[]>`
      SELECT date_trunc('month', d."createdAt") AS m, d.kind, coalesce(-c."amountCents", 0)::int AS price, count(*) AS n
      FROM "DiditSession" d LEFT JOIN "CreditEntry" c ON c.id = d."creditEntryId"
      WHERE d.sandbox = false AND d."createdAt" >= ${since} GROUP BY 1, 2, 3`,
    adminDb.vendorPrice.findMany({ where: { vendor: "didit" }, orderBy: { validFrom: "desc" } }),
    adminDb.vendorInvoice.findMany({ where: { vendor: "didit" } }),
  ]);
  const costAt = (type: string, month: string) => prices.find((p) => p.checkType === type && p.validFrom <= `${month}-31`)?.unitCostCents ?? null;
  const out = new Map<string, { month: string; checks: number; revenue: number; cost: number; missingCost: boolean; byType: Map<string, number> }>();
  for (let i = 0; i < months; i++) {
    const m = new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth() + i, 1)).toISOString().slice(0, 7);
    out.set(m, { month: m, checks: 0, revenue: 0, cost: 0, missingCost: false, byType: new Map() });
  }
  for (const r of rows) {
    const month = r.m.toISOString().slice(0, 7);
    const o = out.get(month);
    if (!o) continue;
    const type = r.kind === "kyb" ? (r.price === KYB_FULL_PRICE_CENTS ? "kyb-full" : "kyb-lite") : r.kind;
    const n = Number(r.n);
    const unit = costAt(type, month);
    o.checks += n;
    o.revenue += n * r.price;
    if (unit === null) o.missingCost = true; else o.cost += n * unit;
    o.byType.set(type, (o.byType.get(type) ?? 0) + n);
  }
  return [...out.values()].map((o) => ({ ...o, invoice: invoices.find((i) => i.period === o.month) ?? null }));
}

export async function currentPrices() {
  const prices = await adminDb.vendorPrice.findMany({ where: { vendor: "didit" }, orderBy: { validFrom: "desc" } });
  return CHECK_TYPES.map((t) => ({ ...t, price: prices.find((p) => p.checkType === t.id) ?? null }));
}
