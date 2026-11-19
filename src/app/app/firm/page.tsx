import Link from "next/link";
import { BadgeCheck, BookOpen, Building2, Download, GraduationCap, Handshake, Lock, Megaphone, Scale } from "lucide-react";
import { Chip } from "@/components/chips";
import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { can } from "@/lib/auth/permissions";
import { SECTORS } from "@/lib/server/auth/flows";
import { ActionForm, Field, Submit } from "@/components/form";
import { saveFirmProfileAction } from "./actions";
import { setDefaultScopeAction } from "../clients/actions";

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
      <h1 className="text-3xl">Compliance Hub</h1>
      <p className="text-sm text-muted">Your firm&apos;s own AMLR obligations. Each part generates its document and keeps the approvals and history for your supervisor.</p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {[
          { href: "/app/firm/risk-assessment", icon: Scale, title: "Business-wide risk assessment", note: "Art. 10", status: ra ? `v${ra.version} in force` : "Not approved yet", done: !!ra },
          { href: "/app/firm/policies", icon: BookOpen, title: "Policies and procedures", note: "Art. 9", status: policy && procedure ? `Policy v${policy.version}, procedures v${procedure.version}` : policy ? "Procedures not approved yet" : "Not approved yet", done: !!policy && !!procedure },
          { href: "/app/firm/governance", icon: Building2, title: "Governance and annual report", note: "Art. 11" },
          { href: "/app/firm/training", icon: GraduationCap, title: "Training", note: "Art. 12" },
          { href: "/app/firm/integrity", icon: BadgeCheck, title: "Integrity and conflicts", note: "Art. 13" },
          { href: "/app/firm/whistleblowing", icon: Megaphone, title: "Whistleblowing channel", note: "Art. 14" },
          { href: "/app/firm/outsourcing", icon: Handshake, title: "Outsourcing register", note: "Art. 18" },
          { href: "/app/firm/privacy", icon: Lock, title: "Privacy notice and DPIA", note: "Art. 76, GDPR" },
        ].map(({ href, icon: Icon, title, note, status, done }) => (
          <li key={href}>
            <Link href={href} className="flex h-full gap-3 rounded-2xl border border-border bg-background p-4 shadow-[var(--shadow)] transition hover:border-accent">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-accent"><Icon aria-hidden className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{title}</span>
                  {done !== undefined && <Chip tone={done ? "green" : "amber"}>{done ? "Done" : "To do"}</Chip>}
                </span>
                <span className="block text-xs text-muted">{status ? `${status} · ` : ""}AMLR {note}</span>
              </span>
            </Link>
          </li>
        ))}
        <li>
          <a href="/api/supervisor-file/firm" className="flex h-full gap-3 rounded-2xl border border-dashed border-border p-4 transition hover:border-accent">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-accent"><Download aria-hidden className="h-5 w-5" /></span>
            <span><span className="block font-semibold">Download the firm supervisor file</span><span className="block text-xs text-muted">Everything a supervisor asks for, as PDF + ZIP</span></span>
          </a>
        </li>
      </ul>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Due diligence for new clients</h2>
        <p className="text-sm text-muted">If most of your clients only receive services outside AMLR scope, new client files can start as identification only (identification and sanctions screening). Switch a client to full due diligence as soon as an AMLR service starts.</p>
        <ActionForm action={setDefaultScopeAction}>
          <fieldset disabled={!can(s.user.roles, "gate.override")} className="space-y-3">
            <Field label="New client files start with" name="defaultCddScope">
              <select name="defaultCddScope" defaultValue={firm.defaultCddScope} className="w-full rounded border border-border bg-background px-3 py-2 text-sm" aria-label="Default scope">
                <option value="full">Full due diligence (AMLR)</option>
                <option value="identification-only">Identification only (services outside AMLR scope)</option>
              </select>
            </Field>
            <Submit variant="secondary">Save default</Submit>
          </fieldset>
        </ActionForm>
      </section>
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
