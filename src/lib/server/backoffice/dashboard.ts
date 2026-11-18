import "server-only";
import { adminDb } from "../db";
import { firmMetrics, misuseSignals } from "./metrics";
import { monthlyFeeFor } from "@/lib/billing/plans";

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

export interface Alert { label: string; href: string; severity: "bad" | "warn"; owner: string }

/** "What needs attention today?" (§5, §22). Counts and links only. */
export async function todayData() {
  const now = new Date();
  const d1 = new Date(now.getTime() - DAY), d7 = new Date(now.getTime() - 7 * DAY);
  const today0 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const m0 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const todayIso = iso(now);
  const [firms, incidents, approvals, overdueInv, lists, failed24, bot24, locked, usersTotal, usersMfa, adminEvents24, pendingGrants, kybOpen, dsrs, signupsStarted7, newFirmsToday, newUsersToday, features7, charges, invoicedMonth] = await Promise.all([
    adminDb.firm.findMany({ select: { id: true, name: true, plan: true, status: true, customFeeCents: true, trialEndsOn: true, createdAt: true, homeState: true } }),
    adminDb.incident.findMany({ where: { status: { in: ["open", "contained"] } }, select: { id: true, title: true, severity: true, personalData: true } }),
    adminDb.adminApproval.count({ where: { status: "pending", expiresAt: { gt: now } } }),
    adminDb.invoice.findMany({ where: { status: "issued", dueOn: { lt: todayIso } }, select: { totalCents: true } }),
    adminDb.screeningList.findMany({ where: { firmId: null, active: true }, select: { name: true, version: true, loadedAt: true } }),
    adminDb.securityEvent.count({ where: { kind: { in: ["login-failed", "mfa-failed"] }, at: { gte: d1 } } }),
    adminDb.securityEvent.count({ where: { kind: { in: ["bot-block", "bot-challenge-failed", "rate-limit"] }, at: { gte: d1 } } }),
    adminDb.user.count({ where: { lockedUntil: { gt: now } } }),
    adminDb.user.count({ where: { deactivatedAt: null } }),
    adminDb.user.count({ where: { deactivatedAt: null, mfaEnrolledAt: { not: null } } }),
    adminDb.adminAuditEvent.count({ where: { at: { gte: d1 } } }),
    adminDb.supportGrant.count({ where: { status: "requested" } }),
    adminDb.firmKyb.findMany({ where: { result: "possible-match", decision: null }, select: { firmId: true }, distinct: ["firmId"] }),
    adminDb.dataSubjectRequest.findMany({ where: { status: { notIn: ["completed", "rejected"] } }, select: { dueOn: true } }),
    adminDb.securityEvent.count({ where: { kind: "signup-started", at: { gte: d7 } } }),
    adminDb.firm.count({ where: { createdAt: { gte: today0 } } }),
    adminDb.user.count({ where: { createdAt: { gte: today0 } } }),
    adminDb.featureRequest.findMany({ where: { createdAt: { gte: d7 }, hidden: false, mergedIntoId: null }, select: { id: true, title: true, regulatory: true, _count: { select: { votes: true } } }, orderBy: { votes: { _count: "desc" } }, take: 5 }),
    adminDb.creditEntry.aggregate({ where: { kind: { in: ["charge", "refund"] }, createdAt: { gte: m0 } }, _sum: { amountCents: true }, _count: true }),
    adminDb.invoice.aggregate({ where: { issuedOn: { gte: iso(m0) }, status: { not: "void" } }, _sum: { netCents: true } }),
  ]);
  const metrics = await firmMetrics();
  const misuse = await misuseSignals();

  // Funnel (§7.4) for firms that signed up in the last 7 days, from product data we hold.
  const recent = firms.filter((f) => f.createdAt >= d7);
  const rm = recent.map((f) => metrics.get(f.id)!).filter(Boolean);
  const funnel = [
    { step: "Sign-up started", n: signupsStarted7 },
    { step: "Email confirmed (firm created)", n: recent.length },
    { step: "Signed in after two-factor set-up", n: rm.filter((m) => m.users > 0 && m.activeUsers30d > 0).length },
    { step: "First client file", n: rm.filter((m) => m.clients > 0).length },
    { step: "First screening or paid check", n: rm.filter((m) => m.screenings30d + m.paidChecksMonth > 0).length },
    { step: "First client accepted", n: rm.filter((m) => m.milestones[2]).length },
  ];

  const period = { from: iso(m0), to: iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))) };
  const billable = firms.filter((f) => f.status === "active");
  const mrr = billable.reduce((s, f) => s + monthlyFeeFor(f.plan, f.customFeeCents, f.trialEndsOn, period.from, period.to), 0);
  const trials = firms.filter((f) => f.trialEndsOn && f.trialEndsOn >= todayIso).length;
  const red = firms.filter((f) => f.status === "active" && metrics.get(f.id)?.health.band === "red");
  const atRisk = firms
    .filter((f) => f.status === "active" && metrics.get(f.id)?.health.band !== "green")
    .map((f) => ({ ...f, m: metrics.get(f.id)! }))
    .sort((a, b) => a.m.health.score - b.m.health.score)
    .slice(0, 8);
  const staleLists = lists.filter((l) => now.getTime() - l.loadedAt.getTime() > DAY);
  const dsrSoon = dsrs.filter((d) => d.dueOn <= iso(new Date(now.getTime() + 7 * DAY))).length;

  const alerts: Alert[] = [];
  for (const i of incidents) alerts.push({ label: `Incident ${i.severity}: ${i.title}${i.personalData ? " (personal data)" : ""}`, href: `/admin/security/incidents/${i.id}`, severity: i.severity === "sev1" || i.personalData ? "bad" : "warn", owner: "Security" });
  if (kybOpen.length) alerts.push({ label: `${kybOpen.length} firm KYB possible sanctions match(es) to review`, href: "/admin/firms?view=kyb", severity: "bad", owner: "Owner + Legal" });
  if (failed24 > 50) alerts.push({ label: `${failed24} failed sign-ins in 24 h: possible credential stuffing`, href: "/admin/security", severity: "bad", owner: "Security" });
  if (misuse.length) alerts.push({ label: `${misuse.length} firm(s) with unusual check patterns`, href: "/admin/abuse", severity: "warn", owner: "Ops" });
  if (overdueInv.length) alerts.push({ label: `${overdueInv.length} overdue invoice(s)`, href: "/admin/billing", severity: "warn", owner: "Finance" });
  if (approvals) alerts.push({ label: `${approvals} four-eyes request(s) waiting`, href: "/admin/approvals", severity: "warn", owner: "Owner" });
  if (!lists.length) alerts.push({ label: "No official sanctions list loaded", href: "/admin/content", severity: "bad", owner: "Content" });
  else if (staleLists.length) alerts.push({ label: `${staleLists.length} sanctions list(s) not refreshed in 24 h`, href: "/admin/content", severity: "warn", owner: "Content" });
  if (dsrSoon) alerts.push({ label: `${dsrSoon} data subject request(s) due within 7 days`, href: "/admin/privacy", severity: "warn", owner: "DPO" });
  if (red.length) alerts.push({ label: `${red.length} active firm(s) with a red health score`, href: "/admin/firms?view=red", severity: "warn", owner: "CS" });

  return {
    alerts,
    newToday: { firms: newFirmsToday, users: newUsersToday },
    revenue: { mrrCents: mrr, usageMonthCents: -(charges._sum.amountCents ?? 0), paidChecksMonth: charges._count, invoicedMonthCents: invoicedMonth._sum.netCents ?? 0, overdueCents: overdueInv.reduce((s, i) => s + i.totalCents, 0), overdueCount: overdueInv.length },
    firms: { total: firms.length, active: firms.filter((f) => f.status === "active").length, trials },
    funnel,
    atRisk,
    support: { pendingGrants },
    security: { failed24, bot24, locked, mfaPct: usersTotal ? Math.round((100 * usersMfa) / usersTotal) : 100, adminEvents24 },
    features7,
    lists,
  };
}
