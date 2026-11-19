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

/**
 * Dashboard laid out like ClearAML's: alerts feed, metric cards, risk
 * distribution, review queue, upcoming timeline, program status by pillar,
 * recent clients, activity feed and the onboarding checklist.
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
    const firm = await tx.firm.findUniqueOrThrow({ where: { id: s.firm.id }, select: { billingName: true } });
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
      overdueRefreshes: reviewQueue.length,
      clientsWithoutRiskAssessment: live.filter((f) => !f.riskAssessments[0]).length,
      overdueTraining,
      integrityOverdue: onePerson ? 0 : users.filter((u) => !declared.has(u.id)).length,
      staffScreeningOpen: (await tx.staffScreening.count({ where: { status: "possible-match" } })) + (onePerson ? 0 : users.filter((u) => !screenedStaff.has(u.id)).length),
      pendingScreeningMatches: openAlerts,
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
      pendingHits, alertFiles: await clientFileForParties(tx, pendingHits.map((h) => h.partyId)), openAlerts, staffOpen,
      userNames: new Map(users.map((u) => [u.id, u.name])),
      timeline: await tx.task.findMany({ where: { ...taskWhere, dueOn: { lte: new Date(addCalendarDays(today, 30)) } }, orderBy: { dueOn: "asc" }, take: 8 }),
      activity: seeAudit ? await tx.auditEvent.findMany({ orderBy: { at: "desc" }, take: 8 }) : [],
    };
  });
  const missing = data.checklist.filter((c) => c.status === "required-missing" || c.status === "not-yet-reviewed");
  const required = data.checklist.filter((c) => c.status === "required-missing");
  const gettingStarted = [
    { done: required.length === 0, title: "Fill in your Country Profile", text: "Your supervisor, FIU and national rules (the EU rules are built in).", href: "/app/settings/country-profile" },
    { done: data.setup.ra, title: "Approve your Business Risk Assessment", text: "Answer a few questions; AMLSync App drafts it for you.", href: "/app/firm/risk-assessment" },
    { done: data.setup.policy, title: "Approve your AML Program", text: "Generated from your risk assessment — review and approve.", href: "/app/firm/policies" },
    { done: data.setup.client, title: "Add your first client", text: "A name and an email are enough to start.", href: "/app/clients/new" },
    { done: data.setup.team, title: "Invite your team", text: "Give colleagues their own sign-in and role.", href: "/app/team" },
    { done: data.setup.billing, title: "Add your invoice details", text: "Company name, VAT number and address for your invoices.", href: "/app/billing" },
  ];
  const doneCount = gettingStarted.filter((g) => g.done).length;
  const h = data.health;
  const overall = h.level === "on-track" ? "On track" : h.level === "at-risk" ? "At risk" : "Needs attention";
  const riskTotal = data.risk.HIGH + data.risk.MEDIUM + data.risk.LOW;
  const card = "rounded-2xl border border-border bg-background p-5 shadow-[var(--shadow)]";
  const alertCount = data.openAlerts + data.staffOpen.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Dashboard</h1>
          <p className="text-muted">Welcome, {s.user.name.split(" ")[0]}. Here is your firm&apos;s compliance at a glance.</p>
        </div>
        <Link href="/app/clients/new" className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-ink hover:brightness-105"><UserPlus aria-hidden className="h-4 w-4" />Add Client</Link>
      </div>

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
              { href: "/app/matters/new", icon: FilePlus2, title: "New Matter" },
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

      {/* Onboarding Checklist */}
      {doneCount < gettingStarted.length && (
        <section className={`space-y-3 ${card}`} aria-labelledby="gs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="gs" className="text-lg">Onboarding Checklist</h2>
            <span className="text-sm text-muted">{doneCount} of {gettingStarted.length} done</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface" role="progressbar" aria-valuemin={0} aria-valuemax={gettingStarted.length} aria-valuenow={doneCount} aria-label="Setup progress">
            <div className="h-full rounded-full bg-brand" style={{ width: `${(doneCount / gettingStarted.length) * 100}%` }} />
          </div>
          <ol className="grid gap-2 sm:grid-cols-2">
            {gettingStarted.map((g) => (
              <li key={g.title}>
                <Link href={g.href} className={`flex gap-3 rounded-xl border border-border p-3 transition hover:border-accent ${g.done ? "bg-surface" : ""}`}>
                  <span aria-hidden className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${g.done ? "bg-green-600 text-white" : "border-2 border-border"}`}>{g.done ? "✓" : ""}</span>
                  <span>
                    <span className={`block text-sm font-semibold ${g.done ? "line-through" : ""}`}>{g.title}<span className="sr-only">{g.done ? " (done)" : ""}</span></span>
                    <span className="block text-xs text-muted">{g.text}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
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
                  <span>{e.userId ? data.userNames.get(e.userId) ?? "Former user" : "System"} <span className="text-muted">{e.action} · {e.objectType}</span></span>
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
