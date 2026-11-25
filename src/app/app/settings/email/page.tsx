import { requireUser } from "@/lib/server/session";
import { adminDb } from "@/lib/server/db";
import { ActionForm, Submit } from "@/components/form";
import { summaryFrequency } from "@/lib/server/summary-email";
import { saveEmailSettingsAction, sendSummaryNowAction } from "./actions";
import { PageTitle, Help } from "@/components/help";

export default async function EmailSettingsPage() {
  const s = await requireUser();
  const u = await adminDb.user.findUniqueOrThrow({ where: { id: s.user.id }, select: { emailSummary: true, newsConsent: true, newsConsentAt: true, roles: true } });
  const effective = summaryFrequency(u.emailSummary, u.roles);
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <PageTitle className="text-3xl" help={<>What AMLSync App emails you, and how often. These settings are personal: each colleague sets their own.</>}>Email settings</PageTitle>
      </div>
      <ActionForm action={saveEmailSettingsAction} className="space-y-5">
        <fieldset className="space-y-2 rounded-2xl border border-border p-4">
          <legend className="px-1 font-semibold">Compliance summary</legend>
          <p className="text-sm text-muted">Where your firm stands on each AML obligation, what&apos;s overdue and what to do first. Now: <strong>{effective === "off" ? "off" : effective}</strong>.</p>
          {([["auto", "Recommended: weekly for the Owner and Compliance Officer, off for others"], ["weekly", "Every week (Monday)"], ["monthly", "Every month (1st)"], ["off", "Off"]] as const).map(([v, l]) => (
            <label key={v} className="flex items-center gap-2 text-sm"><input type="radio" name="summary" value={v} defaultChecked={u.emailSummary === v} /> {l}</label>
          ))}
        </fieldset>
        <fieldset className="space-y-2 rounded-2xl border border-border p-4">
          <legend className="px-1 font-semibold">News from AMLSync</legend>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="news" defaultChecked={!!u.newsConsent} className="mt-1" /> <span>Email me about new AML rules that affect my firm, and about new AMLSync App features. You can stop at any time.{u.newsConsentAt ? <span className="block text-xs text-muted">Your choice was recorded on {u.newsConsentAt.toISOString().slice(0, 10)}.</span> : null}</span></label>
        </fieldset>
        <div className="flex items-start gap-2 text-sm text-muted"><p>Some emails always go out.</p><Help>The law or your security needs them: sign-in and security alerts, invitations, possible sanctions matches, internal suspicion reports to the Compliance Officer, and invoices.</Help></div>
        <Submit>Save email settings</Submit>
      </ActionForm>
      <ActionForm action={sendSummaryNowAction}><Submit variant="secondary">Send me the summary now</Submit></ActionForm>
    </div>
  );
}
