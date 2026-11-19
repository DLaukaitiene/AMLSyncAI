import "server-only";
import { adminDb } from "../db";
import { healthScore, type HealthInput, type HealthResult } from "@/lib/backoffice/health";
import { misuseFlags, type MisuseFlag } from "@/lib/backoffice/misuse";

/**
 * Business metrics for the Backoffice (§6, §8). "AMLSync sees the business,
 * not the customers' AML files" (§1): every query here is a count, sum or
 * group-by over metadata. Nothing selects client names, ID data, screening
 * hits, documents, cases, reports or whistleblowing content — the STR wall
 * (§2.3) is checked by src/lib/backoffice/str-wall.test.ts.
 */
const DAY = 86_400_000;
const dayStart = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const monthStart = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const isoToday = () => new Date().toISOString().slice(0, 10);

type CountMap = Map<string, number>;
const toMap = (rows: { firmId: string | null; _count: number | { _all: number } }[]): CountMap =>
  new Map(rows.filter((r) => r.firmId).map((r) => [r.firmId!, typeof r._count === "number" ? r._count : r._count._all]));

export const MILESTONES = ["Firm risk assessment in force", "Policy approved", "First client accepted", "First ownership tree", "Second user", "First refresh handled"] as const;

export interface FirmMetrics {
  users: number;
  activeUsers30d: number;
  clients: number;
  clients30d: number;
  screenings30d: number;
  screeningsMonth: number;
  paidChecksMonth: number;
  spendMonthCents: number;
  overdueRefreshes: number;
  openCddFiles: number;
  overdueInvoices: number;
  pendingSupport: number;
  lastLogin: Date | null;
  milestones: boolean[];
  health: HealthResult;
}

/** One pass of group-by queries for many firms at once (firm list, dashboard). */
export async function firmMetrics(firmIds?: string[]): Promise<Map<string, FirmMetrics>> {
  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * DAY), d60 = new Date(now.getTime() - 60 * DAY), m0 = monthStart(now);
  const inFirms = firmIds ? { firmId: { in: firmIds } } : {};
  const today = isoToday();
  const [firms, users, sessions, clients, clients30, clientsPrev, scr30, scrPrev, scrMonth, charges, chargesPrev, overdueRef, openFiles, overdueInv, pending, logins, ra, pol, accepted, trees, refreshesDone] = await Promise.all([
    adminDb.firm.findMany({ where: firmIds ? { id: { in: firmIds } } : {}, select: { id: true, spendLimitCents: true } }),
    adminDb.user.groupBy({ by: ["firmId"], where: { ...inFirms, deactivatedAt: null }, _count: true }),
    adminDb.session.groupBy({ by: ["firmId", "userId"], where: { ...inFirms, lastSeenAt: { gte: d30 }, stage: "ACTIVE" } }),
    adminDb.cddFile.groupBy({ by: ["firmId"], where: { ...inFirms, role: "CLIENT" }, _count: true }),
    adminDb.cddFile.groupBy({ by: ["firmId"], where: { ...inFirms, role: "CLIENT", createdAt: { gte: d30 } }, _count: true }),
    adminDb.cddFile.groupBy({ by: ["firmId"], where: { ...inFirms, role: "CLIENT", createdAt: { gte: d60, lt: d30 } }, _count: true }),
    adminDb.screeningEvent.groupBy({ by: ["firmId"], where: { ...inFirms, createdAt: { gte: d30 } }, _count: true }),
    adminDb.screeningEvent.groupBy({ by: ["firmId"], where: { ...inFirms, createdAt: { gte: d60, lt: d30 } }, _count: true }),
    adminDb.screeningEvent.groupBy({ by: ["firmId"], where: { ...inFirms, createdAt: { gte: m0 } }, _count: true }),
    adminDb.creditEntry.groupBy({ by: ["firmId"], where: { ...inFirms, kind: { in: ["charge", "refund"] }, createdAt: { gte: m0 } }, _count: true, _sum: { amountCents: true } }),
    adminDb.creditEntry.groupBy({ by: ["firmId"], where: { ...inFirms, kind: "charge", createdAt: { gte: d60, lt: d30 } }, _count: true }),
    adminDb.task.groupBy({ by: ["firmId"], where: { ...inFirms, kind: "refresh", status: "OPEN", dueOn: { lt: dayStart(now) } }, _count: true }),
    adminDb.cddFile.groupBy({ by: ["firmId"], where: { ...inFirms, status: { notIn: ["REFUSED", "TERMINATED"] } }, _count: true }),
    adminDb.invoice.groupBy({ by: ["firmId"], where: { ...inFirms, status: "issued", dueOn: { lt: today } }, _count: true }),
    adminDb.supportGrant.groupBy({ by: ["firmId"], where: { ...inFirms, status: "requested" }, _count: true }),
    adminDb.securityEvent.groupBy({ by: ["firmId"], where: { ...inFirms, kind: "login" }, _max: { at: true } }),
    adminDb.firmRiskAssessment.groupBy({ by: ["firmId"], where: { ...inFirms, status: "IN_FORCE" }, _count: true }),
    adminDb.policyDocument.groupBy({ by: ["firmId"], where: { ...inFirms, status: "IN_FORCE" }, _count: true }),
    adminDb.cddFile.groupBy({ by: ["firmId"], where: { ...inFirms, role: "CLIENT", decidedAt: { not: null }, status: { notIn: ["REFUSED", "TERMINATED", "OPEN"] } }, _count: true }),
    adminDb.ownershipLink.groupBy({ by: ["firmId"], where: inFirms, _count: true }),
    adminDb.task.groupBy({ by: ["firmId"], where: { ...inFirms, kind: "refresh", status: "DONE" }, _count: true }),
  ]);
  const active = new Map<string, number>();
  for (const s of sessions) active.set(s.firmId, (active.get(s.firmId) ?? 0) + 1);
  const m = {
    users: toMap(users), clients: toMap(clients), clients30: toMap(clients30), clientsPrev: toMap(clientsPrev), scr30: toMap(scr30), scrPrev: toMap(scrPrev), scrMonth: toMap(scrMonth),
    chargesPrev: toMap(chargesPrev), overdueRef: toMap(overdueRef), openFiles: toMap(openFiles), overdueInv: toMap(overdueInv), pending: toMap(pending),
    ra: toMap(ra), pol: toMap(pol), accepted: toMap(accepted), trees: toMap(trees), refreshesDone: toMap(refreshesDone),
  };
  const charge = new Map(charges.map((c) => [c.firmId, { n: c._count, cents: -(c._sum.amountCents ?? 0) }]));
  const lastLogin = new Map(logins.filter((l) => l.firmId).map((l) => [l.firmId!, l._max.at]));
  const g = (map: CountMap, id: string) => map.get(id) ?? 0;
  const dayOfMonth = Math.max(1, (now.getTime() - m0.getTime()) / DAY);

  const out = new Map<string, FirmMetrics>();
  for (const f of firms) {
    const id = f.id;
    const ch = charge.get(id) ?? { n: 0, cents: 0 };
    const milestones = [g(m.ra, id) > 0, g(m.pol, id) > 0, g(m.accepted, id) > 0, g(m.trees, id) > 0, g(m.users, id) >= 2, g(m.refreshesDone, id) > 0];
    const pace = ch.cents / dayOfMonth;
    const input: HealthInput = {
      users: g(m.users, id), activeUsers30d: active.get(id) ?? 0,
      coreActions30d: g(m.clients30, id) + g(m.scr30, id), coreActionsPrev30d: g(m.clientsPrev, id) + g(m.scrPrev, id) + g(m.chargesPrev, id),
      milestonesDone: milestones.filter(Boolean).length, milestonesTotal: milestones.length,
      overdueRefreshes: g(m.overdueRef, id), openCddFiles: g(m.openFiles, id),
      overdueInvoices: g(m.overdueInv, id), pendingSupportRequests: g(m.pending, id),
      budgetRunwayDays: ch.cents > 0 ? Math.max(0, f.spendLimitCents - ch.cents) / Math.max(pace, 1) : null,
    };
    out.set(id, {
      users: input.users, activeUsers30d: input.activeUsers30d, clients: g(m.clients, id), clients30d: g(m.clients30, id),
      screenings30d: g(m.scr30, id), screeningsMonth: g(m.scrMonth, id), paidChecksMonth: ch.n, spendMonthCents: ch.cents,
      overdueRefreshes: input.overdueRefreshes, openCddFiles: input.openCddFiles, overdueInvoices: input.overdueInvoices, pendingSupport: input.pendingSupportRequests,
      lastLogin: lastLogin.get(id) ?? null, milestones, health: healthScore(input),
    });
  }
  return out;
}

/** Monthly usage series for one firm (Firm 360 → Usage). Counts only. */
export async function firmUsage(firmId: string, months = 6) {
  const now = new Date();
  const rows: { month: string; clients: number; matters: number; screenings: number; paidChecks: number; portalSent: number; portalSubmitted: number; aiCalls: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 1));
    const w = { firmId, createdAt: { gte: from, lt: to } };
    const [clients, matters, screenings, paidChecks, portalSent, portalSubmitted, aiCalls] = await Promise.all([
      adminDb.cddFile.count({ where: { ...w, role: "CLIENT" } }),
      adminDb.matter.count({ where: w }),
      adminDb.screeningEvent.count({ where: w }),
      adminDb.creditEntry.count({ where: { ...w, kind: "charge" } }),
      adminDb.portalLink.count({ where: w }),
      adminDb.portalLink.count({ where: { firmId, submittedAt: { gte: from, lt: to } } }),
      adminDb.aiCall.count({ where: w }),
    ]);
    rows.push({ month: from.toISOString().slice(0, 7), clients, matters, screenings, paidChecks, portalSent, portalSubmitted, aiCalls });
  }
  return rows;
}

/** Compliance health as counts (§6.2): lets CS help without seeing client data. */
export async function complianceHealth(firmId: string) {
  const today = dayStart();
  const [openFiles, overdueRefreshes, overdueDiscrepancy, trainingDue, trainingDone, ra, policy] = await Promise.all([
    adminDb.cddFile.count({ where: { firmId, status: "OPEN" } }),
    adminDb.task.count({ where: { firmId, kind: "refresh", status: "OPEN", dueOn: { lt: today } } }),
    adminDb.task.count({ where: { firmId, kind: "discrepancy-report", status: "OPEN", dueOn: { lt: today } } }),
    adminDb.trainingAssignment.count({ where: { firmId } }),
    adminDb.trainingAssignment.count({ where: { firmId, completedAt: { not: null } } }),
    adminDb.firmRiskAssessment.findFirst({ where: { firmId, status: "IN_FORCE" }, orderBy: { version: "desc" }, select: { createdAt: true } }),
    adminDb.policyDocument.count({ where: { firmId, status: "IN_FORCE" } }),
  ]);
  return {
    openFiles, overdueRefreshes, overdueDiscrepancy,
    trainingPct: trainingDue ? Math.round((100 * trainingDone) / trainingDue) : null,
    policiesInForce: policy,
    riskAssessmentAgeDays: ra ? Math.floor((Date.now() - ra.createdAt.getTime()) / DAY) : null,
  };
}

/** Misuse signals per firm (§11.3) from daily screening + paid-check counts. */
export async function misuseSignals(): Promise<{ firmId: string; name: string; flags: MisuseFlag[] }[]> {
  const since = dayStart(new Date(Date.now() - 30 * DAY));
  const [firms, scr, checks, clients] = await Promise.all([
    adminDb.firm.findMany({ select: { id: true, name: true, createdAt: true } }),
    adminDb.$queryRaw<{ firmId: string; day: Date; n: bigint }[]>`SELECT "firmId", date_trunc('day', "createdAt") AS day, count(*) AS n FROM "ScreeningEvent" WHERE "createdAt" >= ${since} GROUP BY 1, 2`,
    adminDb.$queryRaw<{ firmId: string; day: Date; n: bigint }[]>`SELECT "firmId", date_trunc('day', "createdAt") AS day, count(*) AS n FROM "CreditEntry" WHERE kind = 'charge' AND "createdAt" >= ${since} GROUP BY 1, 2`,
    adminDb.cddFile.groupBy({ by: ["firmId"], where: { createdAt: { gte: since } }, _count: true }),
  ]);
  const clientMap = toMap(clients);
  const series = new Map<string, number[]>();
  for (const r of [...scr, ...checks]) {
    const idx = Math.round((r.day.getTime() - since.getTime()) / DAY);
    const arr = series.get(r.firmId) ?? Array(31).fill(0);
    if (idx >= 0 && idx < 31) arr[idx] += Number(r.n);
    series.set(r.firmId, arr);
  }
  const out: { firmId: string; name: string; flags: MisuseFlag[] }[] = [];
  for (const f of firms) {
    const daily = series.get(f.id);
    if (!daily) continue;
    const flags = misuseFlags({ daily, firmAgeDays: Math.floor((Date.now() - f.createdAt.getTime()) / DAY), clientsCreated: clientMap.get(f.id) ?? 0, checksTotal: daily.reduce((a, b) => a + b, 0) });
    if (flags.length) out.push({ firmId: f.id, name: f.name, flags });
  }
  return out;
}
