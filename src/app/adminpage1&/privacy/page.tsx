import { requireAdmin } from "@/lib/server/backoffice/access";
import { adminDb } from "@/lib/server/db";
import { Badge, Page, Section, Table } from "@/components/admin";
import { ActionForm, Field, Submit } from "@/components/form";
import { StepUpLink } from "@/components/step-up";
import { daysUntil } from "@/lib/backoffice/deadlines";
import { createDsrAction, updateDsrAction } from "./actions";

const sel = "w-full rounded border border-border bg-background px-3 py-2 text-sm";

const RETENTION: [string, string, string][] = [
  ["Check results and audit trail", "Set by the firm; default 5 years from end of relationship", "AMLR Art. 77; national law until 10 July 2027 [verify]"],
  ["Security and access logs", "12 months", "Usual practice"],
  ["App and debug logs", "30 days, personal data removed", "Data minimisation"],
  ["Error tracking", "30–90 days", "Data minimisation"],
  ["Invoices and ledger", "10 years", "Lithuanian accounting and VAT rules [confirm with accountant]"],
  ["Anonymous visitor analytics", "13 months, then aggregated", "Privacy-first analytics"],
  ["Admin audit log", "Kept for the life of the service (no personal data of clients)", "Accountability, ISO 27001 evidence"],
];

const SUBPROCESSORS: [string, string, string][] = [
  ["Supabase", "Database and file storage", "EU region"],
  ["Vercel", "Hosting", "EU region [verify function region]"],
  ["Didit", "Identity checks and AML screening", "EU processing"],
  ["Google Workspace", "Email delivery", "EU [verify]"],
  ["Google Cloud Vertex AI / Anthropic", "AI drafting (off by default)", "EU region (Vertex europe-west1)"],
  ["Revolut Bank", "Bank transfers for invoices", "LT"],
];

export default async function PrivacyPage() {
  const a = await requireAdmin("privacy.view");
  const rows = await adminDb.dataSubjectRequest.findMany({ orderBy: [{ closedAt: { sort: "desc", nulls: "first" } }, { dueOn: "asc" }], take: 100 });
  const firms = new Map((await adminDb.firm.findMany({ where: { id: { in: rows.map((r) => r.firmId).filter(Boolean) as string[] } }, select: { id: true, name: true } })).map((f) => [f.id, f.name]));
  return (
    <Page title="Privacy (AMLSync's own GDPR duties)" intro="AMLSync is controller for visitors, leads and its customers' staff accounts, and processor for firms' client data. Requests about AML files go to the firm; AML confidentiality and the tipping-off ban (AMLR Art. 73) may limit what the firm discloses.">
      <Section title="Data subject requests" note="Deadline: one month from receipt, extendable by two months for complex requests (GDPR Art. 12(3)).">
        <Table testId="dsr" head={["Received", "Requester", "Type", "AMLSync is", "Status", "Due", ""]} rows={rows.map((r) => {
          const left = daysUntil(r.dueOn);
          const open = !r.closedAt;
          return [r.receivedOn, <span key="r">{r.requesterName}<br /><span className="text-xs text-muted">{r.requesterEmail}</span></span>, r.kind, r.role + (r.firmId ? ` → ${firms.get(r.firmId)}` : ""), r.status,
            open ? <Badge key="d" tone={left < 0 ? "bad" : left <= 7 ? "warn" : "neutral"}>{r.dueOn}{r.extended ? " (extended)" : ""}</Badge> : r.dueOn,
            open && a.can("privacy.manage") ? (
              <ActionForm key="u" action={updateDsrAction.bind(null, r.id)} className="flex flex-wrap items-end gap-2">
                <select name="status" aria-label="Status" defaultValue={r.status} className="rounded border border-border bg-background px-2 py-1 text-sm">{["received", "identity-check", "in-progress", "forwarded", "completed", "rejected"].map((s) => <option key={s}>{s}</option>)}</select>
                {!r.extended && <label className="text-xs"><input type="checkbox" name="extend" /> extend +2 months</label>}
                <Submit variant="secondary">Save</Submit><StepUpLink />
              </ActionForm>
            ) : "",
          ];
        })} empty="No requests." />
        {a.can("privacy.manage") && (
          <details className="text-sm">
            <summary className="cursor-pointer font-medium">Record a request</summary>
            <ActionForm action={createDsrAction} className="mt-2 grid gap-3 md:grid-cols-3">
              <Field label="Received on (YYYY-MM-DD)" name="receivedOn" defaultValue={new Date().toISOString().slice(0, 10)} required />
              <Field label="Requester name" name="requesterName" required />
              <Field label="Requester email" name="requesterEmail" required />
              <Field label="Type" name="kind"><select name="kind" aria-label="Type" className={sel}>{["access", "erasure", "rectification", "portability", "objection", "restriction"].map((k) => <option key={k}>{k}</option>)}</select></Field>
              <Field label="AMLSync role for this data" name="role"><select name="role" aria-label="AMLSync role for this data" className={sel}><option value="controller">Controller (visitor, lead, firm user account)</option><option value="processor">Processor (a firm&apos;s client data)</option></select></Field>
              <Field label="Firm email domain (processor requests)" name="firmDomain" />
              <div className="md:col-span-3"><Field label="Notes (no client data)" name="notes" /></div>
              <div className="md:col-span-3"><Submit>Record request</Submit><StepUpLink /></div>
            </ActionForm>
          </details>
        )}
      </Section>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Retention"><Table head={["Data", "Retention", "Basis"]} rows={RETENTION} /></Section>
        <Section title="Sub-processors" note="Listed in the customer DPA; firms are notified before a change [keep in sync with the DPA]."><Table head={["Provider", "Purpose", "Location"]} rows={SUBPROCESSORS} /></Section>
      </div>
    </Page>
  );
}
