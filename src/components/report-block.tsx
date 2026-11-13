import type { ReportType } from "@prisma/client";
import { ActionForm, Field, Submit } from "./form";
import { StepUpLink } from "./step-up";
import { REPORT_LABELS } from "@/lib/server/cases";
import { canMarkSubmitted, type CountryProfile } from "@/lib/rules/country-profile";
import { narrativeAction, submittedAction } from "@/app/app/cases/actions";

const KIND: Record<ReportType, Parameters<typeof canMarkSubmitted>[1]> = {
  STR: "str", THRESHOLD: "threshold-report", CASH: "cash-report", DISCREPANCY: "discrepancy-report", SANCTIONS_NOTICE: "sanctions-notice", SUPERVISOR_NOTICE: "supervisor-notice",
};

/** One report: edit narrative (STR), export, mark submitted with a receipt reference. */
export function ReportBlock({
  r,
  narrative,
  profile,
  back,
}: {
  r: { id: string; type: ReportType; status: string; submissionRef: string | null; submittedAt: Date | null; createdAt: Date };
  narrative?: string;
  profile: CountryProfile;
  back: string;
}) {
  const gate = canMarkSubmitted(profile, KIND[r.type]);
  return (
    <div className="space-y-3 rounded border border-border p-3 text-sm">
      <p>
        <strong>{REPORT_LABELS[r.type]}</strong> · {r.status.toLowerCase()} · created {r.createdAt.toISOString().slice(0, 10)}
        {r.submittedAt && ` · submitted ${r.submittedAt.toISOString().slice(0, 10)}, ref. ${r.submissionRef}`}
      </p>
      {r.type === "STR" && r.status !== "SUBMITTED" && (
        <ActionForm action={narrativeAction.bind(null, r.id, back)} className="space-y-2">
          <Field label="Narrative (edit before exporting)" name="narrative">
            <textarea name="narrative" rows={8} aria-label="Narrative" defaultValue={narrative} className="w-full rounded border border-border bg-transparent px-3 py-2 text-sm" />
          </Field>
          <Submit variant="secondary">Save draft</Submit>
        </ActionForm>
      )}
      {r.status !== "SUBMITTED" && (
        <>
          <a href={`/api/reports/${r.id}`} className="inline-block text-accent underline">Export for upload</a>
          {gate.allowed ? (
            <ActionForm action={submittedAction.bind(null, r.id, back)} className="space-y-2">
              <Field label="Submission reference / receipt number" name="reference" required />
              <Submit>Mark as submitted</Submit>
              <StepUpLink />
            </ActionForm>
          ) : (
            <p className="text-amber-800 dark:text-amber-200">{gate.reason}</p>
          )}
        </>
      )}
    </div>
  );
}
