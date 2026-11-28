import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { can } from "@/lib/auth/permissions";
import { INTEGRITY_QUESTIONS, isOnePersonFirm } from "@/lib/server/governance";
import { ActionForm, Field, Submit } from "@/components/form";
import { integrityAction, reviewStaffScreeningAction, screenStaffAction } from "../records-actions";
import { latestStaffScreening } from "@/lib/server/staff-screening";
import { PageTitle, Help } from "@/components/help";

export default async function IntegrityPage() {
  const s = await requireUser();
  const manage = can(s.user.roles, "approve.compliance");
  const data = await withTenant(s.firm.id, async (tx) => ({
    onePerson: await isOnePersonFirm(tx, s.firm.id),
    mine: await tx.integrityDeclaration.findFirst({ where: { userId: s.user.id }, orderBy: { declaredAt: "desc" } }),
    all: manage ? await tx.integrityDeclaration.findMany({ orderBy: { declaredAt: "desc" }, take: 200 }) : [],
    names: new Map((await tx.user.findMany({ select: { id: true, name: true } })).map((u) => [u.id, u.name])),
    staff: manage ? await tx.user.findMany({ where: { deactivatedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [],
    screening: manage ? await latestStaffScreening(tx) : new Map(),
  }));
  if (data.onePerson) {
    return (
      <div className="max-w-3xl space-y-2">
        <h1 className="text-3xl">Staff Checks</h1>
        <p className="text-sm">Not required: AMLR Art. 13 employee checks don&apos;t apply to a one-person firm. This page becomes available when you invite colleagues.</p>
      </div>
    );
  }
  return (
    <div className="max-w-3xl space-y-8">
      <PageTitle className="text-3xl" help={<>Integrity and conflict-of-interest declarations, on joining and every year, and screening of staff against sanctions and PEP lists.</>}>Staff Checks</PageTitle>
      <p className="text-sm">{data.mine ? `Your last declaration: ${data.mine.declaredAt.toISOString().slice(0, 10)}.` : "You haven't made a declaration yet."}</p>
      <ActionForm action={integrityAction} className="space-y-4">
        <h2 className="text-lg font-semibold" data-testid="declaration-for">Your declaration: {s.user.name}</h2>
        <p className="text-sm text-muted">These questions are about you personally. Each person in the firm makes their own declaration when they join and every year.</p>
        {INTEGRITY_QUESTIONS.map((q) => (
          <fieldset key={q.id} className="space-y-1 text-sm">
            <legend className="font-medium">{q.text.replace("{name}", s.user.name)}</legend>
            <div className="flex gap-6">
              <label className="flex items-center gap-2"><input type="radio" name={q.id} value="yes" /> Yes</label>
              <label className="flex items-center gap-2"><input type="radio" name={q.id} value="no" /> No</label>
            </div>
          </fieldset>
        ))}
        <Field label={`Your conflicts of interest, ${s.user.name} (clients, family, financial interests)`} name="conflicts" hint="Leave empty if none. Conflicted staff are excluded from that client." />
        <Submit>Make declaration</Submit>
      </ActionForm>
      {manage && (
        <section data-testid="staff-screening" className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Staff screening</h2>
              <div className="flex items-start gap-2 text-sm text-muted"><p>Free; repeat on joining and when lists change.</p><Help>Your colleagues&apos; names are checked against the sanctions and PEP lists loaded in the app. It doesn&apos;t count towards your screening limits.</Help></div>
            </div>
            <ActionForm action={screenStaffAction}><Submit>Screen all staff now</Submit></ActionForm>
          </div>
          <ul className="divide-y divide-border rounded-xl border border-border text-sm">
            {data.staff.map((u) => {
              const r = data.screening.get(u.id);
              const matches = (r?.matches ?? []) as { listName: string; matchedName: string; score: number; reference: string | null }[];
              const label = !r ? "Not screened yet" : r.status === "clear" ? "No match" : r.status === "possible-match" ? "Possible match: review" : r.status === "cleared" ? "Not the same person (reviewed)" : "Confirmed match";
              const tone = !r ? "text-muted" : r.status === "possible-match" || r.status === "confirmed" ? "text-red-700 dark:text-red-300" : "text-emerald-700 dark:text-emerald-300";
              return (
                <li key={u.id} className="space-y-2 px-4 py-2">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span>{u.name}</span>
                    <span className={tone}>{label}{r ? ` · ${r.screenedAt.toISOString().slice(0, 10)} · ${r.listsChecked} list(s)` : ""}</span>
                  </div>
                  {r && matches.length > 0 && (
                    <ul className="text-xs text-muted">
                      {matches.map((m, i) => <li key={i}>{m.listName}: {m.matchedName} ({Math.round(m.score * 100)}%){m.reference ? ` · ref ${m.reference}` : ""}</li>)}
                    </ul>
                  )}
                  {r?.reviewNote && <p className="text-xs text-muted">Review: {r.reviewNote}</p>}
                  {r?.status === "possible-match" && (
                    <ActionForm action={reviewStaffScreeningAction} className="space-y-2 rounded-lg border border-border p-3">
                      <input type="hidden" name="id" value={r.id} />
                      <div className="flex flex-wrap gap-4">
                        <label className="flex items-center gap-2"><input type="radio" name="outcome" value="cleared" /> Not the same person</label>
                        <label className="flex items-center gap-2"><input type="radio" name="outcome" value="confirmed" /> Confirmed match</label>
                      </div>
                      <Field label="Reason" name="note" required hint="E.g. different date of birth and nationality." />
                      <Submit>Record review</Submit>
                    </ActionForm>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {manage && (
        <section>
          <h2 className="mb-2 text-lg font-semibold">All declarations</h2>
          <ul className="divide-y divide-border rounded-xl border border-border text-sm">
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
