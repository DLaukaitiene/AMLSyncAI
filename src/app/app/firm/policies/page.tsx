import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { can } from "@/lib/auth/permissions";
import type { GeneratedDoc } from "@/lib/docs/model";
import { ActionForm, Submit } from "@/components/form";
import { ActionButton } from "@/components/action-button";
import { DocView } from "@/components/doc-view";
import { acknowledgeAction, aiSectionAction, approvePolicyAction, editSectionAction, generatePoliciesAction } from "../actions";
import { aiEnabled } from "@/lib/server/ai";

export default async function PoliciesPage() {
  const s = await requireUser();
  const docs = await withTenant(s.firm.id, async (tx) => {
    const rows = await tx.policyDocument.findMany({ where: { status: { in: ["DRAFT", "IN_FORCE"] } }, orderBy: [{ kind: "asc" }, { version: "desc" }], include: { acknowledgements: true } });
    const users = await tx.user.findMany({ where: { deactivatedAt: null }, select: { id: true, name: true } });
    return rows.map((r) => ({ ...r, doc: r.content as unknown as GeneratedDoc, missingAck: users.filter((u) => !r.acknowledgements.some((a) => a.userId === u.id)).map((u) => u.name), mine: r.acknowledgements.some((a) => a.userId === s.user.id) }));
  });
  const edit = can(s.user.roles, "approve.compliance");
  const inForce = docs.filter((d) => d.status === "IN_FORCE");
  const drafts = docs.filter((d) => d.status === "DRAFT");
  return (
    <div className="max-w-4xl space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Policies and procedures</h1>
        <p className="text-sm text-muted">AMLR Art. 9. Generated from your firm profile, risk assessment and Country Profile. The policy needs management approval; procedures need at least the compliance manager.</p>
      </div>
      {edit && <ActionButton action={generatePoliciesAction} variant="primary">{drafts.length ? "Regenerate drafts" : "Generate new version"}</ActionButton>}

      {inForce.map((d) => (
        <section key={d.id} className="space-y-3 rounded-md border border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">In force: {d.doc.title} v{d.version}</h2>
            <a className="text-sm text-accent underline" href={`/api/docs/policy/${d.id}`}>Download PDF</a>
          </div>
          {d.mine ? <p className="text-sm">You acknowledged this version.</p> : <ActionButton action={acknowledgeAction.bind(null, d.id)} variant="primary">I have read and will follow this {d.kind}</ActionButton>}
          {edit && d.missingAck.length > 0 && <p className="text-sm text-muted">Not yet acknowledged by: {d.missingAck.join(", ")}</p>}
          <details><summary className="cursor-pointer text-sm">Show</summary><div className="mt-3"><DocView doc={d.doc} /></div></details>
        </section>
      ))}

      {drafts.map((d) => (
        <section key={d.id} className="space-y-4 rounded-md border border-amber-400 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Draft: {d.doc.title} v{d.version}</h2>
            <a className="text-sm text-accent underline" href={`/api/docs/policy/${d.id}`}>Download PDF</a>
          </div>
          {edit && (
            <details>
              <summary className="cursor-pointer text-sm">Edit sections</summary>
              <div className="mt-3 space-y-4">
                {d.doc.sections.map((sec) => (
                  <div key={sec.id} className="space-y-1">
                  <ActionForm action={editSectionAction.bind(null, d.id, sec.id)} className="space-y-1">
                    <label className="block text-sm font-medium" htmlFor={`${d.id}-${sec.id}`}>{sec.heading}</label>
                    <textarea id={`${d.id}-${sec.id}`} name="text" rows={5} className="w-full rounded border border-border bg-transparent px-3 py-2 text-sm"
                      defaultValue={sec.blocks.map((b) => ("p" in b ? b.p : "list" in b ? b.list.join("\n") : "")).join("\n\n")} />
                    <Submit variant="secondary">Save section</Submit>
                  </ActionForm>
                  {aiEnabled() && <ActionButton action={aiSectionAction.bind(null, d.id, sec.id, "/app/firm/policies")}>Improve with AI</ActionButton>}
                  </div>
                ))}
              </div>
            </details>
          )}
          <DocView doc={d.doc} />
          {d.doc.sections.some((x) => x.aiDrafted) && <p className="text-sm">Contains AI-drafted sections (marked). Approving confirms you reviewed them.</p>}
          {can(s.user.roles, "approve.management")
            ? <ActionButton action={approvePolicyAction.bind(null, d.id)} variant="primary">Approve and put in force</ActionButton>
            : <p className="text-sm text-muted">Needs approval by management (Owner).</p>}
        </section>
      ))}
    </div>
  );
}
