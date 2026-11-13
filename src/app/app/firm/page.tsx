import Link from "next/link";
import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { can } from "@/lib/auth/permissions";
import { SECTORS } from "@/lib/server/auth/flows";
import { ActionForm, Field, Submit } from "@/components/form";
import { saveFirmProfileAction } from "./actions";

const CLIENT_TYPES = ["Individuals", "Companies", "Trusts and arrangements", "Non-profit organisations", "Non-EU clients"];

export default async function FirmPage() {
  const s = await requireUser();
  const { firm, ra, policy, procedure } = await withTenant(s.firm.id, async (tx) => ({
    firm: await tx.firm.findUniqueOrThrow({ where: { id: s.firm.id } }),
    ra: await tx.firmRiskAssessment.findFirst({ where: { status: "IN_FORCE" }, orderBy: { version: "desc" } }),
    policy: await tx.policyDocument.findFirst({ where: { kind: "policy", status: "IN_FORCE" }, orderBy: { version: "desc" } }),
    procedure: await tx.policyDocument.findFirst({ where: { kind: "procedure", status: "IN_FORCE" }, orderBy: { version: "desc" } }),
  }));
  const edit = can(s.user.roles, "approve.compliance");
  return (
    <div className="max-w-3xl space-y-8">
      <h1 className="text-2xl font-semibold">Firm</h1>
      <ul className="divide-y divide-border rounded-md border border-border text-sm">
        <li className="flex justify-between px-4 py-2"><Link className="text-accent underline" href="/app/firm/risk-assessment">Business-wide risk assessment</Link><span className="text-muted">{ra ? `v${ra.version} in force` : "not approved yet"}</span></li>
        <li className="flex justify-between px-4 py-2"><Link className="text-accent underline" href="/app/firm/policies">Policies and procedures</Link><span className="text-muted">{policy ? `policy v${policy.version}` : "no policy in force"}{procedure ? ` · procedures v${procedure.version}` : ""}</span></li>
      </ul>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Firm profile</h2>
        <ActionForm action={saveFirmProfileAction}>
          <fieldset disabled={!edit} className="space-y-4">
            <fieldset className="space-y-1 text-sm">
              <legend className="font-medium">Sectors (AMLR Art. 3)</legend>
              <div className="grid gap-1 sm:grid-cols-2">
                {SECTORS.map(([v, l]) => <label key={v} className="flex items-center gap-2"><input type="checkbox" name="sectors" value={v} defaultChecked={firm.sectors.includes(v as never)} /> {l}</label>)}
              </div>
            </fieldset>
            <Field label="Services (one per line)" name="services">
              <textarea name="services" rows={3} aria-label="Services" defaultValue={firm.services.join("\n")} className="w-full rounded border border-border bg-transparent px-3 py-2 text-sm" />
            </Field>
            <fieldset className="space-y-1 text-sm">
              <legend className="font-medium">Client types</legend>
              <div className="flex flex-wrap gap-4">{CLIENT_TYPES.map((t) => <label key={t} className="flex items-center gap-2"><input type="checkbox" name="clientTypes" value={t} defaultChecked={firm.clientTypes.includes(t)} /> {t}</label>)}</div>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Number of staff" name="size" type="number" defaultValue={firm.size ?? ""} />
              <Field label="Cross-border business (%)" name="crossBorderPct" type="number" defaultValue={firm.crossBorderPct ?? ""} />
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="usesCash" defaultChecked={firm.usesCash} /> We accept cash</label>
          </fieldset>
          {edit && <Submit>Save firm profile</Submit>}
        </ActionForm>
      </section>
    </div>
  );
}
