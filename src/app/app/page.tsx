import Link from "next/link";
import { Building2, CalendarClock, FilePlus2, UserPlus } from "lucide-react";
import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { currentProfile } from "@/lib/server/country-profile";
import { setupChecklist } from "@/lib/rules/country-profile";
import { toIsoDate, addCalendarDays } from "@/lib/rules/dates";
import { complianceHealth } from "@/lib/firm/compliance-health";

export default async function Dashboard() {
  const s = await requireUser();
  const today = toIsoDate(new Date());
  const data = await withTenant(s.firm.id, async (tx) => {
    const { profile, version } = await currentProfile(tx, s.firm.id);
    const [clients, openMatters, overdue, due30] = await Promise.all([
      tx.cddFile.count({ where: { role: "CLIENT", status: { notIn: ["REFUSED", "TERMINATED"] } } }),
      tx.matter.count({ where: { status: { in: ["OPEN", "ON_HOLD"] } } }),
      tx.task.count({ where: { status: "OPEN", dueOn: { lt: new Date(today) } } }),
      tx.task.count({ where: { status: "OPEN", dueOn: { gte: new Date(today), lte: new Date(addCalendarDays(today, 30)) } } }),
    ]);
    const firm = await tx.firm.findUniqueOrThrow({ where: { id: s.firm.id }, select: { billingName: true, vatId: true } });
    const setup = {
      ra: (await tx.firmRiskAssessment.count({ where: { status: "IN_FORCE" } })) > 0,
      policy: (await tx.policyDocument.count({ where: { kind: "policy", status: "IN_FORCE" } })) > 0,
      team: (await tx.user.count({ where: { deactivatedAt: null } })) > 1 || (await tx.invitation.count()) > 0,
      client: (await tx.cddFile.count({ where: { role: "CLIENT" } })) > 0,
      billing: !!firm.billingName,
    };
    const now = new Date();
    const checklist = setupChecklist(profile);
    const health = complianceHealth({
      riskAssessmentInForce: setup.ra,
      policyInForce: setup.policy,
      countryProfileRequiredMissing: checklist.filter((c) => c.status === "required-missing").length,
      overdueRefreshes: await tx.cddFile.count({ where: { status: { in: ["COMPLETE", "SDD", "EDD"] }, nextRefreshOn: { lt: now } } }),
      overdueTasks: overdue,
      overdueTraining: await tx.trainingAssignment.count({ where: { completedAt: null, dueOn: { lt: now } } }),
      pendingScreeningMatches: await tx.screeningResult.count({ where: { decision: "PENDING" } }),
      staleOpenFiles: await tx.cddFile.count({ where: { status: "OPEN", createdAt: { lt: new Date(now.getTime() - 30 * 86_400_000) } } }),
    });
    return { checklist, version, clients, openMatters, overdue, due30, setup, health };
  });
  const missing = data.checklist.filter((c) => c.status === "required-missing" || c.status === "not-yet-reviewed");
  const required = data.checklist.filter((c) => c.status === "required-missing");
  const gettingStarted = [
    { done: required.length === 0, title: "Fill in your Country Profile", text: "Your supervisor, FIU and national rules (the EU rules are built in).", href: "/app/settings/country-profile" },
    { done: data.setup.ra, title: "Approve your firm risk assessment", text: "Answer a few questions; AMLSync App drafts it for you.", href: "/app/firm/risk-assessment" },
    { done: data.setup.policy, title: "Approve your AML policy and procedures", text: "Generated from your risk assessment — review and approve.", href: "/app/firm/policies" },
    { done: data.setup.client, title: "Onboard your first client", text: "A name and an email are enough to start.", href: "/app/clients/new" },
    { done: data.setup.team, title: "Invite your team", text: "Give colleagues their own sign-in and role.", href: "/app/team" },
    { done: data.setup.billing, title: "Add your invoice details", text: "Company name, VAT number and address for your invoices.", href: "/app/billing" },
  ];
  const doneCount = gettingStarted.filter((g) => g.done).length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl">Dashboard</h1>
        <p className="text-muted">Welcome, {s.user.name.split(" ")[0]}. What would you like to do?</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { href: "/app/clients/new", icon: UserPlus, title: "Onboard a client", text: "Create the file and send the client a secure link" },
          { href: "/app/matters/new", icon: FilePlus2, title: "Open a matter", text: "A sale, engagement or transaction" },
          { href: "/app/calendar", icon: CalendarClock, title: "See what's due", text: "Refreshes, reports and deadlines" },
          { href: "/app/firm", icon: Building2, title: "Firm compliance", text: "Risk assessment, policies, training" },
        ].map(({ href, icon: Icon, title, text }) => (
          <li key={href}>
            <Link href={href} className="flex h-full gap-3 rounded-2xl border border-border bg-background p-4 shadow-[var(--shadow)] transition hover:border-accent">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-accent"><Icon aria-hidden className="h-5 w-5" /></span>
              <span><span className="block font-semibold">{title}</span><span className="block text-sm text-muted">{text}</span></span>
            </Link>
          </li>
        ))}
      </ul>
      {doneCount < gettingStarted.length && (
        <section className="space-y-3 rounded-2xl border border-border bg-background p-5 shadow-[var(--shadow)]" aria-labelledby="gs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="gs" className="text-lg">Getting started</h2>
            <span className="text-sm text-muted">{doneCount} of {gettingStarted.length} done</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface" role="progressbar" aria-valuemin={0} aria-valuemax={gettingStarted.length} aria-valuenow={doneCount} aria-label="Setup progress">
            <div className="h-full rounded-full bg-brand" style={{ width: `${(doneCount / gettingStarted.length) * 100}%` }} />
          </div>
          <ol className="grid gap-2 sm:grid-cols-2">
            {gettingStarted.map((g) => (
              <li key={g.title}>
                <Link href={g.href} className={`flex gap-3 rounded-xl border p-3 transition hover:border-accent border-border ${g.done ? "bg-surface" : ""}`}>
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
      {(() => {
        const h = data.health;
        const tone = h.level === "on-track" ? "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950" : h.level === "at-risk" ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950" : "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950";
        return (
          <section className={`space-y-2 rounded-2xl border p-5 ${tone}`} aria-labelledby="health">
            <h2 id="health" className="text-lg">Compliance status: {h.level === "on-track" ? "On track" : h.level === "at-risk" ? "At risk" : "Needs attention"}</h2>
            {h.reasons.length === 0 ? (
              <p className="text-sm">Nothing overdue. Your risk assessment and policy are in force.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {h.reasons.map((r) => <li key={r.text}><Link className="underline" href={r.href}>{r.text}</Link>{r.serious ? " — fix first" : ""}</li>)}
              </ul>
            )}
          </section>
        );
      })()}
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          ["Active clients", data.clients, "/app/clients"],
          ["Open matters", data.openMatters, "/app/matters"],
          ["Overdue", data.overdue, "/app/calendar"],
          ["Due in 30 days", data.due30, "/app/calendar"],
        ].map(([label, value, href]) => (
          <li key={label as string}>
            <Link href={href as string} className="block rounded-2xl border border-border bg-surface p-4 hover:border-accent">
              <span className="block text-sm text-muted">{label}</span>
              <span className={`block font-[family-name:var(--font-heading)] text-3xl font-extrabold ${label === "Overdue" && (value as number) > 0 ? "text-red-700 dark:text-red-300" : ""}`}>{value}</span>
            </Link>
          </li>
        ))}
      </ul>

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
