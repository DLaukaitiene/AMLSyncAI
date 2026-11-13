import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { can } from "@/lib/auth/permissions";
import { decryptField } from "@/lib/server/crypto";
import { currentProfile } from "@/lib/server/country-profile";
import { isOnePersonFirm } from "@/lib/server/governance";
import { ActionForm, Field, Submit } from "@/components/form";
import { ActionButton } from "@/components/action-button";
import { whistleStatusAction, whistleblowAction } from "../records-actions";

export default async function WhistleblowingPage() {
  const s = await requireUser();
  const handle = can(s.user.roles, "approve.compliance");
  const data = await withTenant(s.firm.id, async (tx) => ({
    onePerson: await isOnePersonFirm(tx),
    external: (await currentProfile(tx, s.firm.id)).profile.whistleblowing?.externalChannel,
    reports: handle ? (await tx.whistleblowingReport.findMany({ orderBy: { createdAt: "desc" } })).map((r) => ({ ...r, text: (JSON.parse(decryptField(s.firm.id, r.contentEnc)) as { text: string }).text })) : [],
    names: new Map((await tx.user.findMany({ select: { id: true, name: true } })).map((u) => [u.id, u.name])),
  }));
  if (data.onePerson) {
    return (
      <div className="max-w-3xl space-y-2">
        <h1 className="text-2xl font-semibold">Whistleblowing</h1>
        <p className="text-sm">Not required: an internal reporting channel (AMLR Art. 14) is not needed in a one-person firm.</p>
      </div>
    );
  }
  return (
    <div className="max-w-3xl space-y-8">
      <h1 className="text-2xl font-semibold">Report a breach confidentially</h1>
      <p className="text-sm text-muted">
        Use this channel to report breaches of AML rules inside the firm (AMLR Art. 14). You can stay anonymous. You are protected against retaliation.
        {data.external ? ` You can also report externally: ${data.external}.` : ""}
      </p>
      <ActionForm action={whistleblowAction} className="space-y-3">
        <Field label="What do you want to report?" name="text" required>
          <textarea name="text" rows={5} aria-label="What do you want to report?" className="w-full rounded border border-border bg-transparent px-3 py-2 text-sm" />
        </Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="anonymous" defaultChecked /> Send anonymously</label>
        <Submit>Send report</Submit>
      </ActionForm>
      {handle && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Received reports</h2>
          {data.reports.length === 0 && <p className="text-sm text-muted">None.</p>}
          {data.reports.map((r) => (
            <div key={r.id} className="space-y-2 rounded-md border border-border p-4 text-sm">
              <p className="text-muted">{r.createdAt.toISOString().slice(0, 10)} · {r.reporterId ? data.names.get(r.reporterId) : "anonymous"} · {r.status}</p>
              <p className="whitespace-pre-wrap">{r.text}</p>
              {r.status === "received" && <ActionButton action={whistleStatusAction.bind(null, r.id, "acknowledged")}>Acknowledge</ActionButton>}
              {r.status === "acknowledged" && <ActionButton action={whistleStatusAction.bind(null, r.id, "closed")}>Close</ActionButton>}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
