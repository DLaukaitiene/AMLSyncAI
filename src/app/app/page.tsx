import Link from "next/link";
import { NEEDS_REVIEW_WHERE } from "@/lib/monitoring/rules";
import { BellRing, ShieldCheck, UserPlus, X } from "lucide-react";
import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { can } from "@/lib/auth/permissions";
import { clientFileForParties } from "@/lib/server/client-of-party";
import { toIsoDate, addCalendarDays } from "@/lib/rules/dates";
import { TASK_KIND, taskHref } from "@/lib/tasks/labels";
import { RiskChip, StatusChip } from "@/components/chips";
import { adminDb } from "@/lib/server/db";
import { firmObligations } from "@/lib/server/obligations";
import { OBLIGATION_BOXES, OBLIGATIONS } from "@/lib/obligations/catalog";
import { obligationSummary } from "@/lib/obligations/evaluate";
import { ObligationBox, ObligationItem } from "@/components/obligations";
import { AppointInline } from "@/components/appoint-inline";
import { appointAction } from "@/app/app/firm/records-actions";
import { newsConsentAction } from "./settings/email/actions";
import { hasSampleData } from "@/lib/server/sample-data";
import { loadSampleAction, removeSampleAction, setSampleHintAction } from "./sample-actions";
import { ActionButton } from "@/components/action-button";
import { screeningUsage } from "@/lib/server/screening-limits";
import { ScreeningUsage } from "@/components/screening-usage";

/**
 * Dashboard. First: the firm's AML obligations, one box each, with its status and
 * the button that does it (for firms that don't know what the law asks), and a
 * guide for new users. Below: the overview laid out like ClearAML's — alerts,
 * metric cards, program status, risk distribution, review queue, timeline,
 * recent clients and the activity feed.
 */
export default async function Dashboard() {
  const s = await requireUser();
  const r = s.user.roles;
  const today = toIsoDate(new Date());
  const now = new Date();
  const seeCases = can(r, "case.view");
  const seeStaff = can(r, "approve.compliance");
  const data = await withTenant(s.firm.id, async (tx) => {
    const hiddenTypes = [...(seeCases ? [] : ["Case"]), ...(seeStaff ? [] : ["WhistleblowingReport"])];
    const taskWhere = { status: "OPEN" as const, objectType: { notIn: hiddenTypes }, NOT: { kind: { in: seeCases ? [] : ["transaction-hold", "fiu-request", "discrepancy-report"] } } };
    const [overdue, due30] = await Promise.all([
      tx.task.count({ where: { ...taskWhere, dueOn: { lt: new Date(today) } } }),
      tx.task.count({ where: { ...taskWhere, dueOn: { gte: new Date(today), lte: new Date(addCalendarDays(today, 30)) } } }),
    ]);
    const firm = await tx.firm.findUniqueOrThrow({ where: { id: s.firm.id }, select: { billingConfirmedAt: true, responsibilities: true } });
    const users = await tx.user.findMany({ where: { deactivatedAt: null }, select: { id: true, name: true, roles: true } });
    const setup = {
      ra: (await tx.firmRiskAssessment.count({ where: { status: "IN_FORCE" } })) > 0,
      policy: (await tx.policyDocument.count({ where: { kind: "policy", status: "IN_FORCE" } })) > 0,
      team: users.length > 1 || (await tx.invitation.count()) > 0,
      client: (await tx.cddFile.count({ where: { role: "CLIENT" } })) > 0,
      billing: !!firm.billingConfirmedAt,
    };
    const files = await tx.cddFile.findMany({
      where: { role: "CLIENT" }, orderBy: { createdAt: "desc" },
      select: { id: true, status: true, createdAt: true, nextRefreshOn: true, party: { select: { displayName: true, kind: true } }, riskAssessments: { orderBy: { createdAt: "desc" }, take: 1, select: { final: true } } },
    });
    const live = files.filter((f) => f.status !== "REFUSED" && f.status !== "TERMINATED");
    const accepted = live.filter((f) => f.status !== "OPEN");
    const reviewQueue = accepted.filter((f) => f.nextRefreshOn && f.nextRefreshOn < now).sort((a, b) => +a.nextRefreshOn! - +b.nextRefreshOn!);
    const risk = { HIGH: 0, MEDIUM: 0, LOW: 0 } as Record<string, number>;
    for (const f of live) if (f.riskAssessments[0]) risk[f.riskAssessments[0].final]++;
    const pendingHits = await tx.screeningResult.findMany({ where: { decision: "PENDING" }, orderBy: { screenedAt: "desc" }, take: 5, include: { party: { select: { displayName: true } } } });
    const openAlerts = await tx.screeningResult.count({ where: { decision: "PENDING" } });
    const flaggedTx = await tx.transaction.count({ where: NEEDS_REVIEW_WHERE });
    const staffOpen = seeStaff ? await tx.staffScreening.findMany({ where: { status: "possible-match" }, take: 5 }) : [];
    return {
      setup, overdue, due30, risk, reviewQueue: reviewQueue.slice(0, 6), reviewQueueCount: reviewQueue.length,
      total: live.length,
      pendingReviews: live.filter((f) => f.status === "OPEN").length,
      portfolioHealth: live.length ? Math.round((accepted.filter((f) => !(f.nextRefreshOn && f.nextRefreshOn < now)).length / live.length) * 100) : null,
      recent: files.slice(0, 5),
      flaggedTx, pendingHits, alertFiles: await clientFileForParties(tx, pendingHits.map((h) => h.partyId)), openAlerts, staffOpen,
      userNames: new Map(users.map((u) => [u.id, u.name])),
      timeline: await tx.task.findMany({ where: { ...taskWhere, dueOn: { lte: new Date(addCalendarDays(today, 30)) } }, orderBy: { dueOn: "asc" }, take: 8 }),
      obligations: await firmObligations(tx, s.firm.id, { seeCases }),
      usage: await screeningUsage(tx, s.firm.id),
      sample: await hasSampleData(tx),
    };
  });
  const riskTotal = data.risk.HIGH + data.risk.MEDIUM + data.risk.LOW;
  const card = "rounded-2xl border border-border bg-background p-5 shadow-[var(--shadow)]";
  const me = await adminDb.user.findUnique({ where: { id: s.user.id }, select: { newsConsent: true, sampleHintHiddenAt: true } });
  const ob = data.obligations;
  const sum = obligationSummary(ob.statuses);
  const statusOf = new Map(ob.statuses.map((x) => [x.id, x]));
  const canAppoint = can(r, "approve.management");
  // Everything that needs a person now, in one list: red = overdue or a possible breach, amber = waiting
  // for someone or due within 30 days. One-off setup duties (appointing a Compliance Officer, writing the
  // risk assessment for the first time, country profile) stay in the obligations section below.
  const oi = ob.input;
  const attention: { key: string; text: React.ReactNode; href: string; tone: "red" | "amber" }[] = [
    ...data.pendingHits.map((a) => {
      const f = data.alertFiles.get(a.partyId);
      return { key: a.id, tone: "red" as const, href: f ? `/app/clients/${f}#screening` : "/app/monitoring-alerts", text: <><strong>{a.party.displayName}</strong> · possible {a.listKind === "SANCTIONS" ? "sanctions" : a.listKind === "PEP" ? "PEP" : "adverse-media"} match</> };
    }),
    ...(data.openAlerts > data.pendingHits.length ? [{ key: "more-alerts", tone: "red" as const, href: "/app/monitoring-alerts", text: <>{data.openAlerts - data.pendingHits.length} more possible matches</> }] : []),
    ...(data.flaggedTx ? [{ key: "tx", tone: "red" as const, href: "/app/transactions?status=flagged", text: <><strong>{data.flaggedTx} payment(s)</strong> flagged by the monitoring rules</> }] : []),
    ...data.staffOpen.map((x) => ({ key: x.id, tone: "red" as const, href: "/app/firm/integrity", text: <><strong>{data.userNames.get(x.userId) ?? "Staff member"}</strong> · staff screening: possible match</> })),
    ...data.reviewQueue.map((f) => ({ key: f.id, tone: "red" as const, href: `/app/clients/${f.id}`, text: <><strong>{f.party.displayName}</strong> · client review overdue since {toIsoDate(f.nextRefreshOn!)} ({f.status === "EDD" ? "high risk: yearly" : "every 5 years"})</> })),
    ...(data.reviewQueueCount > data.reviewQueue.length ? [{ key: "more-reviews", tone: "red" as const, href: "/app/clients?status=overdue", text: <>{data.reviewQueueCount - data.reviewQueue.length} more overdue client reviews</> }] : []),
    ...(data.overdue ? [{ key: "deadlines", tone: "red" as const, href: "/app/calendar", text: <><strong>{data.overdue} deadline(s)</strong> passed</> }] : []),
    ...(oi.clientsStale ? [{ key: "stale", tone: "red" as const, href: "/app/clients?status=open", text: <><strong>{oi.clientsStale} client file(s)</strong> in progress for more than 30 days</> }] : []),
    ...(seeStaff && oi.whistleblowingLate ? [{ key: "wb-late", tone: "red" as const, href: "/app/firm/whistleblowing", text: <><strong>{oi.whistleblowingLate} whistleblowing report(s)</strong> not acknowledged within 7 days</> }] : []),
    ...(oi.trainingOverdue ? [{ key: "training-late", tone: "red" as const, href: "/app/team/training-register", text: <><strong>{oi.trainingOverdue} training(s)</strong> overdue</> }] : []),
    // Amber: waiting for someone, or due soon.
    ...(oi.highRiskOrPepAwaitingApproval ? [{ key: "hr-approval", tone: "amber" as const, href: "/app/risk-assessments?risk=HIGH", text: <><strong>{oi.highRiskOrPepAwaitingApproval} high-risk or PEP client(s)</strong> waiting for senior management approval</> }] : []),
    ...(oi.clientsInProgress - oi.clientsStale > 0 ? [{ key: "in-progress", tone: "amber" as const, href: "/app/clients?status=open", text: <><strong>{oi.clientsInProgress - oi.clientsStale} client file(s)</strong> not yet decided: finish the checks before you start work</> }] : []),
    ...(oi.internalReportsOpen ? [{ key: "internal-reports", tone: "amber" as const, href: "/app/cases", text: <><strong>{oi.internalReportsOpen} internal suspicion report(s)</strong> to decide</> }] : []),
    ...(oi.reportDrafts ? [{ key: "report-drafts", tone: "amber" as const, href: "/app/reports", text: <><strong>{oi.reportDrafts} report(s)</strong> drafted but not yet sent</> }] : []),
    ...(seeStaff && oi.whistleblowingUnacknowledged - oi.whistleblowingLate > 0 ? [{ key: "wb", tone: "amber" as const, href: "/app/firm/whistleblowing", text: <><strong>{oi.whistleblowingUnacknowledged - oi.whistleblowingLate} whistleblowing report(s)</strong> to acknowledge</> }] : []),
    ...(canAppoint && oi.riskAssessmentDraft && !oi.riskAssessmentInForce ? [{ key: "ra-draft", tone: "amber" as const, href: "/app/firm/risk-assessment", text: <>Firm risk assessment draft waiting for management approval</> }] : []),
    ...(canAppoint && oi.policyDraft && !oi.policyInForce ? [{ key: "policy-draft", tone: "amber" as const, href: "/app/firm/policies", text: <>AML policy draft waiting for management approval</> }] : []),
    ...(oi.reviewsDue30 ? [{ key: "reviews-soon", tone: "amber" as const, href: "/app/clients?status=refresh", text: <><strong>{oi.reviewsDue30} client review(s)</strong> due in the next 30 days</> }] : []),
    ...(data.due30 ? [{ key: "deadlines-soon", tone: "amber" as const, href: "/app/calendar", text: <><strong>{data.due30} deadline(s)</strong> in the next 30 days</> }] : []),
    ...(seeStaff && oi.staffWithoutTraining ? [{ key: "untrained", tone: "amber" as const, href: "/app/team/training-register", text: <><strong>{oi.staffWithoutTraining} colleague(s)</strong> without AML training in the last 12 months</> }] : []),
    ...(seeStaff && oi.integrityDue ? [{ key: "integrity", tone: "amber" as const, href: "/app/firm/integrity", text: <><strong>{oi.integrityDue} integrity declaration(s)</strong> due</> }] : []),
    ...(can(r, "records.purge") && oi.retentionDue ? [{ key: "retention", tone: "amber" as const, href: "/app/records", text: <><strong>{oi.retentionDue} client file(s)</strong> past the 5-year retention period: review for deletion</> }] : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Dashboard</h1>
          <p className="text-muted">Welcome, {s.user.name.split(" ")[0]}. What needs you today, and where your firm stands on its AML duties.</p>
        </div>
        <Link href="/app/clients/new" className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-ink hover:brightness-105"><UserPlus aria-hidden className="h-4 w-4" />Add Client</Link>
      </div>

      {me?.newsConsent === null && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border p-4 text-sm" data-testid="news-consent">
          <p><strong>Stay up to date?</strong> May we email you when AML rules change for your firm, and about new AMLSync App features? You can change this any time in Email Settings.</p>
          <span className="flex gap-2">
            <form action={newsConsentAction.bind(null, true)}><button type="submit" className="rounded-full bg-brand px-4 py-1.5 font-semibold text-brand-ink hover:brightness-105">Yes, keep me informed</button></form>
            <form action={newsConsentAction.bind(null, false)}><button type="submit" className="rounded-full border border-border px-4 py-1.5 hover:border-accent">No thanks</button></form>
          </span>
        </section>
      )}

      {seeStaff && (data.sample || (data.total === 0 && !me?.sampleHintHiddenAt)) && (
        <section className={`relative flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 text-sm ${data.sample ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950" : "border-dashed border-border pr-10"}`} data-testid="sample-data">
          {/* Can be closed only while no sample data is loaded; it can be loaded later from Settings → Sample Data. */}
          {!data.sample && (
            <form action={setSampleHintAction.bind(null, true)} className="absolute right-2 top-2">
              <button type="submit" aria-label="Close" title="Close. You can load sample data later in Settings → Sample Data." className="rounded-full p-1 text-muted hover:bg-surface hover:text-foreground" data-testid="sample-data-close"><X aria-hidden className="h-4 w-4" /></button>
            </form>
          )}
          <p>{data.sample ? <><strong>Sample data is loaded.</strong> The clients and cases are made up and marked &ldquo;sample&rdquo;, so you can safely try the app out. We recommend removing them before adding real clients.</> : <><strong>New here?</strong> Load sample data to see how the app works: made-up clients, a company with owners, and a case with payments that raise red flags.</>}</p>
          {data.sample ? <ActionButton action={removeSampleAction}>Remove sample data</ActionButton> : <ActionButton action={loadSampleAction} variant="primary">Load sample data</ActionButton>}
        </section>
      )}

      <ScreeningUsage limits={data.usage.limits} used={data.usage.used} compact />

      {/* Key numbers */}
      <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4" data-testid="metrics">
        {(() => {
          // Number colour = how urgent: red needs action now, orange/amber needs work soon, black (default) is fine.
          const tone = { red: "text-red-700 dark:text-red-300", orange: "text-orange-600 dark:text-orange-300", amber: "text-amber-600 dark:text-amber-300", ok: "" };
          const health = data.portfolioHealth;
          const cards: [string, string, string, string, string][] = [
            ["Clients", String(data.total), "/app/clients", "Active client files", tone.ok],
            ["Not yet decided", String(data.pendingReviews), "/app/clients?status=open", "Client files in progress", data.pendingReviews > 0 ? tone.amber : tone.ok],
            ["Up to date", health == null ? "—" : `${health}%`, "/app/clients?status=accepted", "Clients with complete, current checks", health == null || health === 100 ? tone.ok : health >= 80 ? tone.amber : health >= 50 ? tone.orange : tone.red],
            ["High risk", String(data.risk.HIGH), "/app/risk-assessments?risk=HIGH", riskTotal ? `${data.risk.MEDIUM} medium · ${data.risk.LOW} low` : "Clients rated high risk", data.risk.HIGH > 0 ? tone.red : tone.ok],
          ];
          return cards.map(([label, value, href, hint, cls]) => (
            <li key={label}>
              <Link href={href} className="block h-full rounded-2xl border border-border bg-surface p-4 hover:border-accent">
                <span className="block text-sm text-muted">{label}</span>
                <span className={`block font-[family-name:var(--font-heading)] text-3xl font-extrabold ${cls}`}>{value}</span>
                <span className="block text-xs text-muted">{hint}</span>
              </Link>
            </li>
          ));
        })()}
      </ul>

      {/* Needs your attention */}
      <section aria-labelledby="attention" className={`${card} ${attention.some((a) => a.tone === "red") ? "border-red-300 dark:border-red-800" : ""}`} data-testid="attention">
        <h2 id="attention" className="flex items-center gap-2 text-lg"><BellRing aria-hidden className="h-5 w-5 text-accent" />Needs your attention{attention.length ? <span className="rounded-full bg-red-600 px-2 text-xs font-bold text-white">{attention.length}</span> : null}</h2>
        {attention.length === 0 ? (
          <p className="mt-2 flex items-center gap-2 text-sm text-muted"><ShieldCheck aria-hidden className="h-4 w-4 text-green-600" />Nothing waiting. Clients are re-screened every day.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border text-sm">
            {attention.map((a) => (
              <li key={a.key} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className={a.tone === "red" ? "" : "text-muted"}>{a.text}</span>
                <Link href={a.href} className="rounded-full border border-border px-3 py-1 hover:border-accent">Open</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Your obligations */}
      <section aria-labelledby="obligations" className="space-y-3" data-testid="obligations">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="obligations" className="text-2xl">Your obligations</h2>
          </div>
          <Link href="/app/obligations" className="text-sm text-accent underline">All obligations explained</Link>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface" role="progressbar" aria-valuemin={0} aria-valuemax={sum.total} aria-valuenow={sum.done} aria-label="Obligations in order">
          <div className="h-full rounded-full bg-green-600" style={{ width: `${sum.total ? (sum.done / sum.total) * 100 : 0}%` }} />
        </div>
        {(() => {
          const box = (b: (typeof OBLIGATION_BOXES)[number]) => (
            <ObligationBox key={b.id} title={b.title} open={b.ids.filter((id) => ["todo", "overdue", "pending"].includes(statusOf.get(id)!.state)).length}>
              {b.ids.map((id) => {
                const o = OBLIGATIONS.find((x) => x.id === id)!;
                return (
                  <ObligationItem key={id} o={o} status={statusOf.get(id)!}>
                    {id === "compliance-officer" && canAppoint && (!ob.input.complianceOfficer || !ob.input.responsibleManager) && (
                      <div className="mt-2 space-y-2">
                        {!ob.input.complianceOfficer && <AppointInline staff={ob.input.staff} action={appointAction.bind(null, "compliance-officer")} label="Compliance Officer" current={ob.input.complianceOfficer} />}
                        {!ob.input.responsibleManager && <AppointInline staff={ob.input.staff} action={appointAction.bind(null, "compliance-manager")} label="Responsible manager (management body)" current={ob.input.responsibleManager} />}
                      </div>
                    )}
                  </ObligationItem>
                );
              })}
            </ObligationBox>
          );
          const [company, team, clients, deals, reporting] = OBLIGATION_BOXES;
          return (
            <div className="grid items-start gap-5 lg:grid-cols-2">
              <div className="space-y-5">{box(company)}{box(team)}</div>
              <div className="space-y-5">{box(clients)}{box(deals)}{box(reporting)}</div>
            </div>
          );
        })()}
        <p className="text-sm"><strong>In doubt about a client or a payment?</strong> Don&apos;t go ahead: report it to your Compliance Officer from the client or payment, and never tell the client. <Link href="/app/obligations#reporting" className="text-accent underline">How reporting works</Link></p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Upcoming deadlines */}
        <section aria-labelledby="timeline" className={card}>
          <div className="flex items-center justify-between"><h2 id="timeline" className="text-lg">Upcoming deadlines</h2><Link href="/app/calendar" className="text-sm text-accent underline">Compliance Calendar</Link></div>
          {data.timeline.length === 0 ? <p className="mt-2 text-sm text-muted">Nothing due in the next 30 days.</p> : (
            <ul className="mt-2 divide-y divide-border text-sm">
              {data.timeline.map((t) => {
                const d = toIsoDate(t.dueOn);
                const tone = d < today ? "text-red-700 dark:text-red-300 font-semibold" : d <= addCalendarDays(today, 7) ? "text-amber-700 dark:text-amber-300" : "text-muted";
                return (
                  <li key={t.id} className="flex items-center justify-between gap-2 py-2">
                    <Link href={taskHref(t)} className="text-accent hover:underline">{TASK_KIND[t.kind] ?? t.kind}</Link>
                    <span className={tone}>{d < today ? "Overdue · " : ""}{d}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Recent clients */}
        <section aria-labelledby="recent" className={card}>
          <div className="flex items-center justify-between"><h2 id="recent" className="text-lg">Recent clients</h2><Link href="/app/clients" className="text-sm text-accent underline">All Clients</Link></div>
          {data.recent.length === 0 ? <p className="mt-2 text-sm text-muted">No clients yet. <Link href="/app/clients/new" className="text-accent underline">Add your first client</Link>.</p> : (
            <ul className="mt-2 divide-y divide-border text-sm">
              {data.recent.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link href={`/app/clients/${f.id}`} className="font-medium text-accent hover:underline">{f.party.displayName}</Link>
                  <span className="flex items-center gap-2"><RiskChip level={f.riskAssessments[0]?.final} /><StatusChip status={f.status} /></span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
