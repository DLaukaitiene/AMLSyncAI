import Link from "next/link";
import { NEEDS_REVIEW_WHERE } from "@/lib/monitoring/rules";
import { BellRing, ShieldCheck, UserPlus } from "lucide-react";
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
import { loadSampleAction, removeSampleAction } from "./sample-actions";
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
  const me = await adminDb.user.findUnique({ where: { id: s.user.id }, select: { newsConsent: true } });
  const ob = data.obligations;
  const sum = obligationSummary(ob.statuses);
  const statusOf = new Map(ob.statuses.map((x) => [x.id, x]));
  const canAppoint = can(r, "approve.management");
  // Everything that needs a person now, in one list.
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
    ...(!data.setup.billing && seeStaff ? [{ key: "billing", tone: "amber" as const, href: "/app/billing#invoice-details", text: <>Add your invoice details before your first invoice</> }] : []),
    ...(!data.setup.team && seeStaff ? [{ key: "team", tone: "amber" as const, href: "/app/team", text: <>Invite your colleagues so each has their own sign-in</> }] : []),
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

      {seeStaff && (data.sample || data.total === 0) && (
        <section className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 text-sm ${data.sample ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950" : "border-dashed border-border"}`} data-testid="sample-data">
          <p>{data.sample ? <><strong>Sample data is loaded.</strong> The clients and case marked &ldquo;(sample)&rdquo; are made up, so you can try everything safely. Remove them before you add real clients.</> : <><strong>New here?</strong> Load sample data to see how the app works: made-up clients, a company with owners, and a case with payments that raise red flags.</>}</p>
          {data.sample ? <ActionButton action={removeSampleAction}>Remove sample data</ActionButton> : <ActionButton action={loadSampleAction} variant="primary">Load sample data</ActionButton>}
        </section>
      )}

      <ScreeningUsage limits={data.usage.limits} used={data.usage.used} compact />

      {/* Key numbers */}
      <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4" data-testid="metrics">
        {([
          ["Clients", String(data.total), "/app/clients", "Active client files"],
          ["Not yet decided", String(data.pendingReviews), "/app/clients?status=open", "Client files in progress"],
          ["Up to date", data.portfolioHealth == null ? "—" : `${data.portfolioHealth}%`, "/app/clients?status=accepted", "Clients with complete, current checks"],
          ["High risk", String(data.risk.HIGH), "/app/risk-assessments?risk=HIGH", riskTotal ? `${data.risk.MEDIUM} medium · ${data.risk.LOW} low` : "Clients rated high risk"],
        ] as const).map(([label, value, href, hint]) => (
          <li key={label}>
            <Link href={href} className="block h-full rounded-2xl border border-border bg-surface p-4 hover:border-accent">
              <span className="block text-sm text-muted">{label}</span>
              <span className={`block font-[family-name:var(--font-heading)] text-3xl font-extrabold ${label === "High risk" && value !== "0" ? "text-red-700 dark:text-red-300" : ""}`}>{value}</span>
              <span className="block text-xs text-muted">{hint}</span>
            </Link>
          </li>
        ))}
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
            <p className="text-sm text-muted"><strong className="text-foreground">{sum.done} of {sum.total}</strong> in order{sum.overdue ? <> · <strong className="text-red-800 dark:text-red-300">{sum.overdue} need action now</strong></> : null}{sum.todo ? ` · ${sum.todo} to do` : ""}. Each line is a duty the AML rules give your firm: press <span aria-hidden>(?)</span> for what it means, and the link below it to do it.</p>
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
