import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { can } from "@/lib/auth/permissions";
import type { GeneratedDoc } from "@/lib/docs/model";
import { ActionButton } from "@/components/action-button";
import { DocView } from "@/components/doc-view";
import { approvePolicyAction, generatePrivacyAction } from "../actions";

const KINDS = { "privacy-notice": "Privacy notice for clients", dpia: "Data protection impact assessment (DPIA)" } as const;

export default async function PrivacyPage() {
  const s = await requireUser();
  const docs = await withTenant(s.firm.id, (tx) =>
    tx.policyDocument.findMany({ where: { kind: { in: Object.keys(KINDS) }, status: { in: ["DRAFT", "IN_FORCE"] } }, orderBy: { version: "desc" } }),
  );
  const edit = can(s.user.roles, "approve.compliance");
  return (
    <div className="max-w-4xl space-y-8">
      <h1 className="text-2xl font-semibold">Data protection</h1>
      <p className="text-sm text-muted">AMLR Art. 76 and GDPR. The privacy notice in force is shown to clients in the portal. AMLSyncAI acts as your processor (data processing agreement).</p>
      {(Object.keys(KINDS) as (keyof typeof KINDS)[]).map((k) => (
        <section key={k} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">{KINDS[k]}</h2>
            {edit && <ActionButton action={generatePrivacyAction.bind(null, k)}>Generate new version</ActionButton>}
          </div>
          {docs.filter((d) => d.kind === k).map((d) => (
            <div key={d.id} className={`space-y-3 rounded-md border p-4 ${d.status === "DRAFT" ? "border-amber-400" : "border-border"}`}>
              <div className="flex items-center justify-between"><strong className="text-sm">{d.status === "DRAFT" ? "Draft" : "In force"} v{d.version}</strong><a className="text-sm text-accent underline" href={`/api/docs/policy/${d.id}`}>Download PDF</a></div>
              <DocView doc={d.content as unknown as GeneratedDoc} />
              {d.status === "DRAFT" && can(s.user.roles, "approve.management") && <ActionButton action={approvePolicyAction.bind(null, d.id)} variant="primary">Approve</ActionButton>}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
