import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { can } from "@/lib/auth/permissions";
import { INTEGRITY_QUESTIONS, isOnePersonFirm } from "@/lib/server/governance";
import { ActionForm, Field, Submit } from "@/components/form";
import { integrityAction } from "../records-actions";

export default async function IntegrityPage() {
  const s = await requireUser();
  const manage = can(s.user.roles, "approve.compliance");
  const data = await withTenant(s.firm.id, async (tx) => ({
    onePerson: await isOnePersonFirm(tx),
    mine: await tx.integrityDeclaration.findFirst({ where: { userId: s.user.id }, orderBy: { declaredAt: "desc" } }),
    all: manage ? await tx.integrityDeclaration.findMany({ orderBy: { declaredAt: "desc" }, take: 200 }) : [],
    names: new Map((await tx.user.findMany({ select: { id: true, name: true } })).map((u) => [u.id, u.name])),
  }));
  if (data.onePerson) {
    return (
      <div className="max-w-3xl space-y-2">
        <h1 className="text-2xl font-semibold">Integrity and conflicts</h1>
        <p className="text-sm">Not required: AMLR Art. 13 employee checks don&apos;t apply to a one-person firm. This page becomes available when you invite colleagues.</p>
      </div>
    );
  }
  return (
    <div className="max-w-3xl space-y-8">
      <h1 className="text-2xl font-semibold">Integrity and conflicts of interest</h1>
      <p className="text-sm text-muted">AMLR Art. 13: on joining and every year. {data.mine ? `Your last declaration: ${data.mine.declaredAt.toISOString().slice(0, 10)}.` : "You haven't made a declaration yet."}</p>
      <ActionForm action={integrityAction} className="space-y-4">
        {INTEGRITY_QUESTIONS.map((q) => (
          <fieldset key={q.id} className="space-y-1 text-sm">
            <legend className="font-medium">{q.text}</legend>
            <div className="flex gap-6">
              <label className="flex items-center gap-2"><input type="radio" name={q.id} value="yes" /> Yes</label>
              <label className="flex items-center gap-2"><input type="radio" name={q.id} value="no" /> No</label>
            </div>
          </fieldset>
        ))}
        <Field label="Conflicts of interest (clients, family, financial interests)" name="conflicts" hint="Leave empty if none. Conflicted staff are excluded from that client." />
        <Submit>Make declaration</Submit>
      </ActionForm>
      {manage && (
        <section>
          <h2 className="mb-2 text-lg font-semibold">All declarations</h2>
          <ul className="divide-y divide-border rounded-md border border-border text-sm">
            {data.all.map((d) => {
              const a = d.answers as Record<string, string>;
              const flags = INTEGRITY_QUESTIONS.filter((q) => ("expect" in q ? a[q.id] !== q.expect : a[q.id] === "yes")).map((q) => q.id);
              return <li key={d.id} className="flex justify-between px-4 py-2"><span>{data.names.get(d.userId)} · {d.kind}</span><span className={flags.length || d.conflicts ? "text-red-700 dark:text-red-300" : "text-muted"}>{d.declaredAt.toISOString().slice(0, 10)}{flags.length ? ` · check: ${flags.join(", ")}` : ""}{d.conflicts ? ` · conflict: ${d.conflicts}` : ""}</span></li>;
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
