import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { can } from "@/lib/auth/permissions";
import { riskAssessmentAsDoc } from "@/lib/server/firm-docs";
import { CONTROL_OPTIONS, CONTROL_QUESTIONS, RISK_QUESTIONS, type Answers } from "@/lib/firm/risk-assessment";
import { ActionForm, Submit } from "@/components/form";
import { ActionButton } from "@/components/action-button";
import { DocView } from "@/components/doc-view";
import { approveRiskAssessmentAction, saveAnswersAction, startRiskAssessmentAction } from "../actions";

export default async function RiskAssessmentPage() {
  const s = await requireUser();
  const data = await withTenant(s.firm.id, async (tx) => {
    const draft = await tx.firmRiskAssessment.findFirst({ where: { status: "DRAFT" }, orderBy: { version: "desc" } });
    const current = await tx.firmRiskAssessment.findFirst({ where: { status: "IN_FORCE" }, orderBy: { version: "desc" } });
    return {
      draft,
      current,
      draftDoc: draft ? await riskAssessmentAsDoc(tx, s.firm.id, draft.id) : null,
      currentDoc: current ? await riskAssessmentAsDoc(tx, s.firm.id, current.id) : null,
    };
  });
  const edit = can(s.user.roles, "approve.compliance");
  const a = (data.draft?.answers ?? {}) as Answers;
  const unanswered = (data.draft?.result as { unanswered?: string[] } | undefined)?.unanswered;
  const groups = [...new Set(RISK_QUESTIONS.map((q) => q.group))];

  return (
    <div className="max-w-4xl space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Business-wide risk assessment</h1>
        <p className="text-sm text-muted">AMLR Art. 10. The Compliance Officer drafts it; management approves it. Review it every year and before any new service, channel or market.</p>
      </div>

      {data.current && data.currentDoc && (
        <section className="space-y-3 rounded-md border border-border p-4">
          <div className="flex items-center justify-between"><h2 className="font-semibold">In force: version {data.current.version}</h2><a className="text-sm text-accent underline" href={`/api/docs/risk-assessment/${data.current.id}`}>Download PDF</a></div>
          <details><summary className="cursor-pointer text-sm">Show</summary><div className="mt-3"><DocView doc={data.currentDoc} /></div></details>
        </section>
      )}

      {!data.draft && edit && <ActionButton action={startRiskAssessmentAction} variant="primary">{data.current ? "Start a new version" : "Start the risk assessment"}</ActionButton>}

      {data.draft && (
        <>
          <ActionForm action={saveAnswersAction.bind(null, data.draft.id)} className="space-y-6">
            <h2 className="text-lg font-semibold">Draft version {data.draft.version}</h2>
            <fieldset disabled={!edit} className="space-y-6">
              {groups.map((g) => (
                <fieldset key={g} className="space-y-4 rounded-md border border-border p-4">
                  <legend className="px-1 font-semibold">{g}</legend>
                  {RISK_QUESTIONS.filter((q) => q.group === g).map((q) => (
                    <fieldset key={q.id} className="space-y-1 text-sm">
                      <legend className="font-medium">{q.text} <span className="text-xs font-normal text-muted">({q.threats.join(", ")} · {q.annex})</span></legend>
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {q.options.map((o, i) => <label key={o} className="flex items-center gap-1"><input type="radio" name={q.id} value={i} defaultChecked={a[q.id] === i} /> {o}</label>)}
                      </div>
                    </fieldset>
                  ))}
                </fieldset>
              ))}
              <fieldset className="space-y-4 rounded-md border border-border p-4">
                <legend className="px-1 font-semibold">Controls</legend>
                {CONTROL_QUESTIONS.map((q) => (
                  <fieldset key={q.id} className="space-y-1 text-sm">
                    <legend className="font-medium">{q.text} <span className="text-xs font-normal text-muted">({q.article})</span></legend>
                    <div className="flex flex-wrap gap-x-4">
                      {CONTROL_OPTIONS.map((o, i) => <label key={o} className="flex items-center gap-1"><input type="radio" name={q.id} value={i} defaultChecked={a[q.id] === i} /> {o}</label>)}
                    </div>
                  </fieldset>
                ))}
              </fieldset>
            </fieldset>
            {edit && <Submit>Save and calculate</Submit>}
          </ActionForm>

          {data.draftDoc && unanswered && unanswered.length === 0 && (
            <section className="space-y-3 rounded-md border border-border p-4">
              <div className="flex items-center justify-between"><h2 className="font-semibold">Result (draft)</h2><a className="text-sm text-accent underline" href={`/api/docs/risk-assessment/${data.draft.id}`}>Download PDF</a></div>
              <DocView doc={data.draftDoc} />
              {can(s.user.roles, "approve.management")
                ? <ActionButton action={approveRiskAssessmentAction.bind(null, data.draft.id)} variant="primary">Approve (management)</ActionButton>
                : <p className="text-sm text-muted">A member of management (Owner) must approve it.</p>}
            </section>
          )}
        </>
      )}
    </div>
  );
}
