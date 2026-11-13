import Link from "next/link";
import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { bucket, type CalendarBucket } from "@/lib/rules/deadlines";
import { toIsoDate } from "@/lib/rules/dates";
import { can } from "@/lib/auth/permissions";

const KIND: Record<string, string> = {
  refresh: "CDD refresh", "sdd-verification": "SDD verification (60 days)", "cdd-required": "CDD required", "threshold-report": "Threshold report",
  "discrepancy-report": "BO register discrepancy (14 days)", "transaction-hold": "Transaction hold (3 working days)", "fiu-request": "FIU request",
  "former-pep": "Former PEP review", "retention-end": "Records deletion", "portal-review": "Review client portal submission", "risk-assessment-review": "Review the business-wide risk assessment", "policy-review": "Review policies and procedures", "annual-report": "Annual compliance report", "refresh-review": "Refresh needs review", "matter-review": "New matter doesn't match the client profile", "integrity-declaration": "Integrity declaration", "whistleblowing-ack": "Acknowledge whistleblowing report (7 days)", "portal-stalled": "Client hasn't completed the portal (7+ days)",
};
const TITLES: Record<CalendarBucket, string> = { overdue: "Overdue", "due-30-days": "Due in the next 30 days", later: "Later", done: "Done" };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const s = await requireUser();
  const { show } = await searchParams;
  const today = toIsoDate(new Date());
  // Case and whistleblowing deadlines are need-to-know: hidden from users who can't open them (§8C.7).
  const hidden = [
    ...(can(s.user.roles, "case.view") ? [] : ["Case"]),
    ...(can(s.user.roles, "approve.compliance") ? [] : ["WhistleblowingReport"]),
  ];
  const tasks = await withTenant(s.firm.id, (tx) =>
    tx.task.findMany({
      where: { ...(show === "done" ? { status: "DONE" } : { status: "OPEN" }), objectType: { notIn: hidden }, NOT: { kind: { in: hidden.includes("Case") ? ["transaction-hold", "fiu-request", "discrepancy-report"] : [] } } },
      orderBy: { dueOn: "asc" },
      take: 500,
    }),
  );
  const groups = new Map<CalendarBucket, typeof tasks>();
  for (const t of tasks) {
    const b = bucket({ due: toIsoDate(t.dueOn), done: t.status === "DONE" }, today);
    groups.set(b, [...(groups.get(b) ?? []), t]);
  }
  const href = (t: (typeof tasks)[number]) =>
    t.objectType === "CddFile" ? `/app/clients/${t.objectId}` : t.objectType === "Matter" ? `/app/matters/${t.objectId}` : t.objectType === "Case" ? `/app/cases/${t.objectId}`
    : t.objectType === "FirmRiskAssessment" || t.objectType === "Firm" ? "/app/firm/risk-assessment" : t.objectType === "PolicyDocument" ? (t.kind === "annual-report" ? "/app/firm/governance" : "/app/firm/policies")
    : t.objectType === "User" ? "/app/firm/integrity" : t.objectType === "WhistleblowingReport" ? "/app/firm/whistleblowing" : "#";
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Compliance Calendar</h1>
        <Link href={show === "done" ? "/app/calendar" : "/app/calendar?show=done"} className="text-sm text-accent underline">{show === "done" ? "Show open" : "Show done"}</Link>
      </div>
      <p className="text-sm text-muted">Every deadline uses your Country Profile&apos;s working days and holidays.</p>
      {tasks.length === 0 && <p className="text-sm">Nothing here.</p>}
      {(["overdue", "due-30-days", "later", "done"] as CalendarBucket[]).filter((b) => groups.has(b)).map((b) => (
        <section key={b}>
          <h2 className={`mb-2 font-semibold ${b === "overdue" ? "text-red-700 dark:text-red-300" : ""}`}>{TITLES[b]}</h2>
          <ul className="divide-y divide-border rounded-md border border-border text-sm">
            {groups.get(b)!.map((t) => (
              <li key={t.id} className="flex justify-between px-4 py-2">
                <Link href={href(t)} className="text-accent underline">{KIND[t.kind] ?? t.kind}</Link>
                <span className="text-muted">{toIsoDate(t.dueOn)}{t.article ? ` · ${t.article}` : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
