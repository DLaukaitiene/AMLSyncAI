import Link from "next/link";
import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { bucket, type CalendarBucket } from "@/lib/rules/deadlines";
import { toIsoDate } from "@/lib/rules/dates";

const KIND: Record<string, string> = {
  refresh: "CDD refresh", "sdd-verification": "SDD verification (60 days)", "cdd-required": "CDD required", "threshold-report": "Threshold report",
  "discrepancy-report": "BO register discrepancy (14 days)", "transaction-hold": "Transaction hold (3 working days)", "fiu-request": "FIU request",
  "former-pep": "Former PEP review", "retention-end": "Records deletion",
};
const TITLES: Record<CalendarBucket, string> = { overdue: "Overdue", "due-30-days": "Due in the next 30 days", later: "Later", done: "Done" };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const s = await requireUser();
  const { show } = await searchParams;
  const today = toIsoDate(new Date());
  const tasks = await withTenant(s.firm.id, (tx) =>
    tx.task.findMany({ where: show === "done" ? { status: "DONE" } : { status: "OPEN" }, orderBy: { dueOn: "asc" }, take: 500 }),
  );
  const groups = new Map<CalendarBucket, typeof tasks>();
  for (const t of tasks) {
    const b = bucket({ due: toIsoDate(t.dueOn), done: t.status === "DONE" }, today);
    groups.set(b, [...(groups.get(b) ?? []), t]);
  }
  const href = (t: (typeof tasks)[number]) => (t.objectType === "CddFile" ? `/app/clients/${t.objectId}` : t.objectType === "Matter" ? `/app/matters/${t.objectId}` : "#");
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
