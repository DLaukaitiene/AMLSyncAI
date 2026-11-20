import Link from "next/link";
import { BellRing, Building2, CalendarClock, FilePlus2, ShieldCheck, UserPlus } from "lucide-react";
import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { can } from "@/lib/auth/permissions";
import { currentProfile } from "@/lib/server/country-profile";
import { isOnePersonFirm } from "@/lib/server/governance";
import { clientFileForParties } from "@/lib/server/client-of-party";
import { setupChecklist } from "@/lib/rules/country-profile";
import { toIsoDate, addCalendarDays } from "@/lib/rules/dates";
import { complianceHealth, programStatus } from "@/lib/firm/compliance-health";
import { TASK_KIND, taskHref } from "@/lib/tasks/labels";
import { RiskChip, StatusChip } from "@/components/chips";
import { OBJECT_LABEL } from "@/lib/audit-labels";
import { RESPONSIBILITIES } from "@/lib/firm/responsibilities";
import { adminDb } from "@/lib/server/db";
import { firmObligations } from "@/lib/server/obligations";
import { OBLIGATIONS } from "@/lib/obligations/catalog";
import { obligationSummary, sectorNote } from "@/lib/obligations/evaluate";
import { ObligationCard } from "@/components/obligations";
import { AppointInline } from "@/components/appoint-inline";
import { appointAction } from "@/app/app/firm/records-actions";
import { setGuideAction } from "./guide-actions";
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
  const seeAudit = can(r, "securityLog.view");
  const data = await withTenant(s.firm.id, async (tx) => {
    const { profile, version } = await currentProfile(tx, s.firm.id);
    const hiddenTypes = [...(seeCases ? [] : ["Case"]), ...(seeStaff ? [] : ["WhistleblowingReport"])];
    const taskWhere = { status: "OPEN" as const, objectType: { notIn: hiddenTypes }, NOT: { kind: { in: seeCases ? [] : ["transaction-hold", "fiu-request", "discrepancy-report"] } } };
    const [overdue, due30] = await Promise.all([
      tx.task.count({ where: { ...taskWhere, dueOn: { lt: new Date(today) } } }),
      tx.task.count({ where: { ...taskWhere, dueOn: { gte: new Date(today), lte: new Date(addCalendarDays(today, 30)) } } }),
    ]);
    const firm = await tx.firm.findUniqueOrThrow({ where: { id: s.firm.id }, select: { billingName: true, responsibilities: true } });
    const users = await tx.user.findMany({ where: { deactivatedAt: null }, select: { id: true, name: true, roles: true } });
    const onePerson = await isOnePersonFirm(tx);
    const setup = {
      ra: (await tx.firmRiskAssessment.count({ where: { status: "IN_FORCE" } })) > 0,
      policy: (await tx.policyDocument.count({ where: { kind: "policy", status: "IN_FORCE" } })) > 0,
      team: users.length > 1 || (await tx.invitation.count()) > 0,
      client: (await tx.cddFile.count({ where: { role: "CLIENT" } })) > 0,
      billing: !!firm.billingName,
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
    const flaggedTx = await tx.transaction.count({ where: { monitorStatus: "flagged" } });
    const staffOpen = seeStaff ? await tx.staffScreening.findMany({ where: { status: "possible-match" }, take: 5 }) : [];
    const checklist = setupChecklist(profile);
    const cpMissing = checklist.filter((c) => c.status === "required-missing").length;
    const overdueTraining = await tx.trainingAssignment.count({ where: { completedAt: null, dueOn: { lt: now } } });
    const staleOpenFiles = live.filter((f) => f.status === "OPEN" && f.createdAt < new Date(now.getTime() - 30 * 86_400_000)).length;
    const yearAgo = new Date(now.getTime() - 365 * 86_400_000);
    const declared = new Set((await tx.integrityDeclaration.findMany({ where: { declaredAt: { gte: yearAgo } }, select: { userId: true } })).map((d) => d.userId));
    const screenedStaff = new Set((await tx.staffScreening.findMany({ select: { userId: true } })).map((x) => x.userId));
    const health = complianceHealth({
      riskAssessmentInForce: setup.ra, policyInForce: setup.policy, countryProfileRequiredMissing: cpMissing,
      overdueRefreshes: reviewQueue.length, overdueTasks: overdue, overdueTraining, pendingScreeningMatches: openAlerts, staleOpenFiles,
    });
    const pillars = programStatus({
      riskAssessmentInForce: setup.ra, policyInForce: setup.policy, countryProfileRequiredMissing: cpMissing,
      complianceOfficerAppointed: users.some((u) => u.roles.includes("COMPLIANCE_OFFICER")),
      unassignedDuties: RESPONSIBILITIES.filter((d) => !((firm.responsibilities as Record<string, string[]>)[d.key] ?? []).some((id) => users.some((u) => u.id === id))).length,
      overdueRefreshes: reviewQueue.length,
      clientsWithoutRiskAssessment: live.filter((f) => !f.riskAssessments[0]).length,
      overdueTraining,
      integrityOverdue: onePerson ? 0 : users.filter((u) => !declared.has(u.id)).length,
      staffScreeningOpen: (await tx.staffScreening.count({ where: { status: "possible-match" } })) + (onePerson ? 0 : users.filter((u) => !screenedStaff.has(u.id)).length),
      pendingScreeningMatches: openAlerts,
      flaggedTransactions: flaggedTx,
      staleOpenFiles,
      overdueCaseTasks: await tx.task.count({ where: { status: "OPEN", kind: { in: ["transaction-hold", "fiu-request", "discrepancy-report"] }, dueOn: { lt: new Date(today) } } }),
      draftReportsOlderThan7Days: await tx.report.count({ where: { status: "DRAFT", createdAt: { lt: new Date(now.getTime() - 7 * 86_400_000) } } }),
    });
    return {
      checklist, version, setup, health, pillars, overdue, due30, risk, reviewQueue: reviewQueue.slice(0, 6), reviewQueueCount: reviewQueue.length,
      total: live.length,
      pendingReviews: live.filter((f) => f.status === "OPEN").length,
      portfolioHealth: live.length ? Math.round((accepted.filter((f) => !(f.nextRefreshOn && f.nextRefreshOn < now)).length / live.length) * 100) : null,
      recent: files.slice(0, 5),
      flaggedTx, pendingHits, alertFiles: await clientFileForParties(tx, pendingHits.map((h) => h.partyId)), openAlerts, staffOpen,
      userNames: new Map(users.map((u) => [u.id, u.name])),
      timeline: await tx.task.findMany({ where: { ...taskWhere, dueOn: { lte: new Date(addCalendarDays(today, 30)) } }, orderBy: { dueOn: "asc" }, take: 8 }),
      activity: seeAudit ? await tx.auditEvent.findMany({ orderBy: { at: "desc" }, take: 8 }) : [],
      obligations: await firmObligations(tx, s.firm.id, { seeCases }),
      usage: await screeningUsage(tx, s.firm.id),
    };
  });
  const missing = data.checklist.filter((c) => c.status === "required-missing" || c.status === "not-yet-reviewed");
  const h = data.health;
  const overall = h.level === "on-track" ? "On track" : h.level === "at-risk" ? "At risk" : "Needs attention";
  const riskTotal = data.risk.HIGH + data.risk.MEDIUM + data.risk.LOW;
  const card = "rounded-2xl border border-border bg-background p-5 shadow-[var(--shadow)]";
  const alertCount = data.openAlerts + data.staffOpen.length + data.flaggedTx;
  const guideHidden = !!(await adminDb.user.findUnique({ where: { id: s.user.id }, select: { guideHiddenAt: true } }))?.guideHiddenAt;
  const ob = data.obligations;
  const sum = obligationSummary(ob.statuses);
  const statusOf = new Map(ob.statuses.map((x) => [x.id, x]));
  const groups = [...new Set(OBLIGATIONS.map((o) => o.group))];
  const canAppoint = can(r, "approve.management");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Dashboard</h1>
          <p className="text-muted">Welcome, {s.user.name.split(" ")[0]}. These are the duties the anti-money-laundering rules give your firm, and where you stand on each.</p>
        </div>
        <Link href="/app/clients/new" className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-ink hover:brightness-105"><UserPlus aria-hidden className="h-4 w-4" />Add Client</Link>
      </div>

      <ScreeningUsage limits={data.usage.limits} used={data.usage.used} compact />

      {/* Dashboard guide */}
      {!guideHidden ? (
        <section aria-labelledby="guide" className="space-y-3 rounded-2xl border border-accent/40 bg-brand/10 p-5" data-testid="dashboard-guide">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h2 id="guide" className="text-lg">How this page works</h2>
            <form action={setGuideAction.bind(null, true)}><button type="submit" className="text-sm text-accent underline">Hide the guide</button></form>
          </div>
          <ol className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <li><strong className="block">1. Each box is a legal duty</strong>The EU anti-money-laundering rules (AMLR) apply to your firm. Every box below is one thing they require, in plain words.</li>
            <li><strong className="block">2. Colours show where you stand</strong><span className="text-green-800 dark:text-green-300">In order</span>, <span className="text-amber-800 dark:text-amber-300">to do</span>, or <span className="text-red-800 dark:text-red-300">act now</span> (a deadline has passed or a decision is waiting).</li>
            <li><strong className="block">3. Click the button to do it</strong>Each box takes you to the right page. &ldquo;What does this mean?&rdquo; explains the duty, when it applies and the steps.</li>
            <li><strong className="block">4. Start at the top</strong>Set up your firm first, then check every client, record every deal, and report anything suspicious to your Compliance Officer.</li>
          </ol>
          <p className="text-sm"><strong>If in doubt about a client or a payment:</strong> don&apos;t go ahead, and report it to your Compliance Officer from the case or payment. Never tell the client. <Link href="/app/obligations#reporting" className="text-accent underline">How reporting works</Link></p>
        </section>
      ) : (
        <form action={setGuideAction.bind(null, false)} className="text-right"><button type="submit" className="text-sm text-accent underline">Show the dashboard guide</button></form>
      )}

      {/* Your obligations */}
      <section aria-labelledby="obligations" className="space-y-4" data-testid="obligations">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="obligations" className="text-2xl">Your obligations</h2>
            <p className="text-sm text-muted"><strong className="text-foreground">{sum.done} of {sum.total}</strong> in order{sum.overdue ? <> · <strong className="text-red-800 dark:text-red-300">{sum.overdue} need action now</strong></> : null}{sum.todo ? ` · ${sum.todo} to do` : ""}</p>
          </div>
          <Link href="/app/obligations" className="text-sm text-accent underline">All obligations explained</Link>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface" role="progressbar" aria-valuemin={0} aria-valuemax={sum.total} aria-valuenow={sum.done} aria-label="Obligations in order">
          <div className="h-full rounded-full bg-green-600" style={{ width: `${sum.total ? (sum.done / sum.total) * 100 : 0}%` }} />
        </div>
        {groups.map((g) => (
          <div key={g} className="space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">{g}</h3>
            <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {OBLIGATIONS.filter((o) => o.group === g).map((o) => (
                <ObligationCard key={o.id} o={o} status={statusOf.get(o.id)!} note={sectorNote(o, ob.input.sectors)}>
                  {o.id === "compliance-officer" && canAppoint && (!ob.input.complianceOfficer || !ob.input.responsibleManager) && (
                    <div className="space-y-2">
                      {!ob.input.complianceOfficer && <AppointInline staff={ob.input.staff} action={appointAction.bind(null, "compliance-officer")} label="Compliance Officer" current={ob.input.complianceOfficer} />}
                      {!ob.input.responsibleManager && <AppointInline staff={ob.input.staff} action={appointAction.bind(null, "compliance-manager")} label="Responsible manager (management body)" current={ob.input.responsibleManager} />}
                    </div>
                  )}
                </ObligationCard>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <h2 className="border-t border-border pt-6 text-2xl">Overview</h2>

      {/* Alerts Feed */}
      <section aria-labelledby="alerts" className={`${card} ${alertCount ? "border-red-300 dark:border-red-800" : ""}`} data-testid="alerts-feed">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="alerts" className="flex items-center gap-2 text-lg"><BellRing aria-hidden className="h-5 w-5 text-accent" />Alerts{alertCount ? <span className="rounded-full bg-red-600 px-2 text-xs font-bold text-white">{alertCount}</span> : null}</h2>
          <Link href="/app/monitoring-alerts" className="text-sm text-accent underline">All Monitoring Alerts</Link>
        </div>
        {alertCount === 0 ? (
          <p className="mt-2 flex items-center gap-2 text-sm text-muted"><ShieldCheck aria-hidden className="h-4 w-4 text-green-600" />No open alerts. Clients are re-screened every day.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border text-sm">
            {data.pendingHits.map((a) => {
              const m = a.matchData as { matchedName?: string };
              const f = data.alertFiles.get(a.partyId);
              return (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span><span className="font-medium">{a.party.displayName}</span> <span className="text-muted">· possible {a.listKind === "SANCTIONS" ? "sanctions" : a.listKind === "PEP" ? "PEP" : "adverse media"} match: {m.matchedName}</span></span>
                  {f && <Link href={`/app/clients/${f}#screening`} className="rounded-full border border-border px-3 py-1 hover:border-accent">Review</Link>}
                </li>
              );
            })}
            {data.flaggedTx > 0 && (
              <li className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><span className="font-medium">{data.flaggedTx} transaction(s)</span> <span className="text-muted">· flagged by monitoring rules</span></span>
                <Link href="/app/transactions?status=flagged" className="rounded-full border border-border px-3 py-1 hover:border-accent">Review</Link>
              </li>
            )}
            {data.staffOpen.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><span className="font-medium">{data.userNames.get(x.userId) ?? "Staff member"}</span> <span className="text-muted">· staff screening: possible match</span></span>
                <Link href="/app/firm/integrity" className="rounded-full border border-border px-3 py-1 hover:border-accent">Review</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Metric cards */}
      <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {([
          ["Total Clients", String(data.total), "/app/clients", "Active client files"],
          ["Pending Reviews", String(data.pendingReviews), "/app/clients?status=open", "Files not yet decided"],
          ["Portfolio Health", data.portfolioHealth == null ? "—" : `${data.portfolioHealth}%`, "/app/clients?status=accepted", "Clients with complete, current CDD"],
          ["High Risk Cases", String(data.risk.HIGH), "/app/risk-assessments?risk=HIGH", "Clients rated high risk"],
        ] as const).map(([label, value, href, hint]) => (
          <li key={label}>
            <Link href={href} className="block h-full rounded-2xl border border-border bg-surface p-4 hover:border-accent">
              <span className="block text-sm text-muted">{label}</span>
              <span className={`block font-[family-name:var(--font-heading)] text-3xl font-extrabold ${label === "High Risk Cases" && value !== "0" ? "text-red-700 dark:text-red-300" : ""}`}>{value}</span>
              <span className="block text-xs text-muted">{hint}</span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Program Status */}
        <section aria-labelledby="program" className={card} data-testid="program-status">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="program" className="text-lg">Program Status</h2>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${h.level === "on-track" ? "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-200" : h.level === "at-risk" ? "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200" : "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"}`}>Compliance status: {overall}</span>
          </div>
          <ul className="mt-3 space-y-3">
            {data.pillars.map((p) => (
              <li key={p.id}>
                <Link href={p.href} className="block rounded-lg p-1 hover:bg-surface">
                  <span className="flex justify-between text-sm"><span className="font-medium">{p.label}</span><span className="text-muted">{p.score}%</span></span>
                  <span className="mt-1 block h-2 overflow-hidden rounded-full bg-surface" aria-hidden><span className={`block h-full rounded-full ${p.score === 100 ? "bg-green-600" : p.score >= 50 ? "bg-amber-500" : "bg-red-600"}`} style={{ width: `${Math.max(p.score, 4)}%` }} /></span>
                  {p.issues.length > 0 && <span className="mt-1 block text-xs text-muted">{p.issues.join(" · ")}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* Risk Distribution */}
        <section aria-labelledby="riskdist" className={card}>
          <h2 id="riskdist" className="text-lg">Risk Distribution</h2>
          {riskTotal === 0 ? <p className="mt-2 text-sm text-muted">No risk assessments yet. Each client is rated as soon as you add them.</p> : (
            <>
              <div className="mt-3 flex h-4 overflow-hidden rounded-full" role="img" aria-label={`High ${data.risk.HIGH}, medium ${data.risk.MEDIUM}, low ${data.risk.LOW}`}>
                {data.risk.HIGH > 0 && <span className="bg-red-600" style={{ width: `${(data.risk.HIGH / riskTotal) * 100}%` }} />}
                {data.risk.MEDIUM > 0 && <span className="bg-amber-500" style={{ width: `${(data.risk.MEDIUM / riskTotal) * 100}%` }} />}
                {data.risk.LOW > 0 && <span className="bg-green-600" style={{ width: `${(data.risk.LOW / riskTotal) * 100}%` }} />}
              </div>
              <ul className="mt-3 grid grid-cols-3 gap-2 text-sm">
                {(["HIGH", "MEDIUM", "LOW"] as const).map((l) => (
                  <li key={l}><Link href={`/app/risk-assessments?risk=${l}`} className="block rounded-lg border border-border p-2 hover:border-accent"><RiskChip level={l} /><span className="mt-1 block text-2xl font-semibold">{data.risk[l]}</span></Link></li>
                ))}
              </ul>
            </>
          )}
        </section>

        {/* Review Queue */}
        <section aria-labelledby="queue" className={card}>
          <div className="flex items-center justify-between"><h2 id="queue" className="text-lg">Review Queue</h2><span className="text-sm text-muted">{data.reviewQueueCount} overdue</span></div>
          {data.reviewQueue.length === 0 ? <p className="mt-2 text-sm text-muted">No client reviews overdue.</p> : (
            <ul className="mt-2 divide-y divide-border text-sm">
              {data.reviewQueue.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-2 py-2">
                  <Link href={`/app/clients/${f.id}`} className="font-medium text-accent hover:underline">{f.party.displayName}</Link>
                  <span className="font-semibold text-red-700 dark:text-red-300">due {toIsoDate(f.nextRefreshOn!)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Upcoming Timeline */}
        <section aria-labelledby="timeline" className={card}>
          <div className="flex items-center justify-between"><h2 id="timeline" className="text-lg">Upcoming Timeline</h2><Link href="/app/calendar" className="text-sm text-accent underline">Compliance Calendar</Link></div>
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
          <p className="mt-2 text-xs text-muted">{data.overdue} overdue · {data.due30} due in the next 30 days</p>
        </section>

        {/* Recent Clients */}
        <section aria-labelledby="recent" className={card}>
          <div className="flex items-center justify-between"><h2 id="recent" className="text-lg">Recent Clients</h2><Link href="/app/clients" className="text-sm text-accent underline">All Clients</Link></div>
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

        {/* Quick Actions */}
        <section aria-labelledby="quick" className={card}>
          <h2 id="quick" className="text-lg">Quick Actions</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {[
              { href: "/app/clients/new", icon: UserPlus, title: "Add Client" },
              { href: "/app/matters/new", icon: FilePlus2, title: "New Case" },
              { href: "/app/registers", icon: CalendarClock, title: "Audit-ready reports", show: seeStaff },
              { href: "/app/firm/policies", icon: Building2, title: "AML Program" },
            ].filter((q) => q.show !== false).map(({ href, icon: Icon, title }) => (
              <li key={href}>
                <Link href={href} className="flex items-center gap-3 rounded-xl border border-border p-3 hover:border-accent">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand/15 text-accent"><Icon aria-hidden className="h-4 w-4" /></span>
                  <span className="text-sm font-semibold">{title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {(!data.setup.billing || !data.setup.team) && (
        <section className={`space-y-2 ${card}`} aria-labelledby="account">
          <h2 id="account" className="text-lg">Account setup</h2>
          <ul className="space-y-1 text-sm">
            {!data.setup.team && <li><Link href="/app/team" className="text-accent underline">Invite your team</Link> <span className="text-muted">so colleagues have their own sign-in and role.</span></li>}
            {!data.setup.billing && <li><Link href="/app/billing" className="text-accent underline">Add your invoice details</Link> <span className="text-muted">(company name, VAT number and address).</span></li>}
          </ul>
        </section>
      )}

      {/* Activity Feed */}
      {seeAudit && (
        <section aria-labelledby="activity" className={card}>
          <div className="flex items-center justify-between"><h2 id="activity" className="text-lg">Activity Feed</h2><Link href="/app/audit-trail" className="text-sm text-accent underline">Audit Trail</Link></div>
          {data.activity.length === 0 ? <p className="mt-2 text-sm text-muted">No activity yet.</p> : (
            <ul className="mt-2 divide-y divide-border text-sm">
              {data.activity.map((e) => (
                <li key={String(e.id)} className="flex flex-wrap justify-between gap-2 py-1.5">
                  <span>{e.userId ? data.userNames.get(e.userId) ?? "Former user" : "System"} <span className="text-muted">{e.action} · {(OBJECT_LABEL[e.objectType] ?? e.objectType).toLowerCase()}</span></span>
                  <span className="text-muted">{e.at.toISOString().slice(0, 16).replace("T", " ")}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {missing.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Finish setting up your Country Profile</h2>
          <p className="text-sm text-muted">
            AMLSync App ships the general EU rules. National details are entered by your firm. Missing required items only block
            the workflows that depend on them.
          </p>
          <ul className="divide-y divide-border rounded-xl border border-border text-sm">
            {missing.map((m) => (
              <li key={m.parameter} className="flex justify-between gap-4 px-4 py-2">
                <span>{m.label}</span>
                <span className="text-muted">{m.status === "required-missing" ? `Required · blocks: ${m.blocks}` : "Not yet reviewed"}</span>
              </li>
            ))}
          </ul>
          <Link href="/app/settings/country-profile" className="inline-block text-sm text-accent underline">Open Country Profile (version {data.version})</Link>
        </section>
      )}
    </div>
  );
}
