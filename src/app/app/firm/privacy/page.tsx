import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { can } from "@/lib/auth/permissions";
import type { GeneratedDoc } from "@/lib/docs/model";
import { ActionButton } from "@/components/action-button";
import { DocView } from "@/components/doc-view";
import { approvePolicyAction, generatePrivacyAction } from "../actions";
import { PageTitle } from "@/components/help";
import { ActionForm, Submit } from "@/components/form";
import { setDataProtectionLeadAction } from "../governance/actions";
import { DATA_PROTECTION_KEY, dutySetting } from "@/lib/firm/responsibilities";

const KINDS = { "privacy-notice": "Privacy notice for clients", dpia: "Data protection impact assessment (DPIA)" } as const;

export default async function PrivacyPage() {
  const s = await requireUser();
  const { docs, users, lead } = await withTenant(s.firm.id, async (tx) => ({
    docs: await tx.policyDocument.findMany({ where: { kind: { in: Object.keys(KINDS) }, status: { in: ["DRAFT", "IN_FORCE"] } }, orderBy: { version: "desc" } }),
    users: await tx.user.findMany({ where: { deactivatedAt: null, external: false }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    lead: dutySetting(((await tx.firm.findUniqueOrThrow({ where: { id: s.firm.id }, select: { responsibilities: true } })).responsibilities as Record<string, unknown> | null)?.[DATA_PROTECTION_KEY]).to?.[0] ?? "",
  }));
  const edit = can(s.user.roles, "approve.compliance");
  return (
    <div className="max-w-4xl space-y-8">
      <PageTitle className="text-3xl" help={<>The privacy notice in force is shown to clients in the portal. AMLSync acts as your processor (data processing agreement). Its suppliers and where they process data: <a className="text-accent underline" href="/subprocessors">sub-processors</a>.</>}>Data Protection</PageTitle>
      <section className="space-y-2 rounded-2xl border border-border p-4 text-sm" data-testid="data-protection-lead">
        <h2 className="text-lg font-semibold">Data protection lead</h2>
        <p className="text-muted">Who handles privacy notices, requests from people about their data, and data breaches (GDPR). This is separate from your AML roles.</p>
        {edit ? (
          <ActionForm action={setDataProtectionLeadAction} className="flex flex-wrap items-center gap-2 [&>[role=alert]]:order-last [&>[role=alert]]:basis-full [&>[role=status]]:order-last [&>[role=status]]:basis-full">
            <select name="lead" defaultValue={lead} className="rounded border border-border bg-background px-2 py-1.5" aria-label="Data protection lead">
              <option value="">Nobody yet</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <Submit variant="secondary">Save</Submit>
          </ActionForm>
        ) : <p>{users.find((u) => u.id === lead)?.name ?? "Nobody yet"}</p>}
      </section>
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
