import Link from "next/link";
import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { CASE_LABELS, readContent } from "@/lib/server/cases";
import { ActionForm, Field, Submit } from "@/components/form";
import { fiuRequestAction } from "./actions";

export default async function CasesPage() {
  const s = await requireUser("case.view");
  const cases = await withTenant(s.firm.id, async (tx) => {
    const cs = await tx.case.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
    return cs.map((c) => ({ ...c, summary: readContent(s.firm.id, c).summary ?? readContent(s.firm.id, c).fiu?.reference ?? "" }));
  });
  const open = cases.filter((c) => c.status === "open" || (c.status === "decided" && c.decision === "report"));
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Cases</h1>
        <p className="text-sm text-muted">Visible only to the Compliance Officer. Every assessment is kept, including decisions not to report.</p>
      </div>
      <section>
        <h2 className="mb-2 font-semibold">Needs attention ({open.length})</h2>
        <CaseList cases={open} />
      </section>
      <section>
        <h2 className="mb-2 font-semibold">All cases</h2>
        <CaseList cases={cases} />
      </section>
      <section className="max-w-xl space-y-2">
        <h2 className="font-semibold">Log an FIU request</h2>
        <ActionForm action={fiuRequestAction}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Received on" name="received" type="date" required />
            <Field label="FIU reference" name="reference" required />
          </div>
          <Field label="What the FIU asked for" name="request" required />
          <Field label="FIU deadline (working days)" name="deadlineWorkingDays" type="number" hint="Leave empty for 5 working days (Art. 69(1)(b)); enter a shorter deadline if the FIU set one." />
          <Submit variant="secondary">Log request</Submit>
        </ActionForm>
      </section>
    </div>
  );
}

function CaseList({ cases }: { cases: { id: string; type: keyof typeof CASE_LABELS; status: string; decision: string | null; createdAt: Date; dueOn: Date | null; summary: string }[] }) {
  if (!cases.length) return <p className="text-sm text-muted">None.</p>;
  return (
    <ul className="divide-y divide-border rounded-md border border-border text-sm">
      {cases.map((c) => (
        <li key={c.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
          <span><Link href={`/app/cases/${c.id}`} className="text-accent underline">{CASE_LABELS[c.type]}</Link> <span className="text-muted">· {c.summary.slice(0, 80)}</span></span>
          <span className="text-muted">{c.status}{c.decision ? ` (${c.decision})` : ""} · {c.createdAt.toISOString().slice(0, 10)}{c.dueOn ? ` · due ${c.dueOn.toISOString().slice(0, 10)}` : ""}</span>
        </li>
      ))}
    </ul>
  );
}
