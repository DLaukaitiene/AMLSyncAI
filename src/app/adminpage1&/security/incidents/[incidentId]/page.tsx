import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/server/backoffice/access";
import { adminDb } from "@/lib/server/db";
import { Badge, fmtDateTime, Page, Section, Table } from "@/components/admin";
import { ActionForm, Field, Submit } from "@/components/form";
import { StepUpLink } from "@/components/step-up";
import { breachClock } from "@/lib/backoffice/deadlines";
import { updateIncidentAction } from "../../actions";

export default async function IncidentPage({ params }: { params: Promise<{ incidentId: string }> }) {
  const a = await requireAdmin("security.view");
  const { incidentId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(incidentId)) notFound();
  const i = await adminDb.incident.findUnique({ where: { id: incidentId }, include: { updates: { orderBy: { at: "desc" } } } });
  if (!i) notFound();
  const firms = await adminDb.firm.findMany({ where: { id: { in: i.firmIds } }, select: { name: true, emailDomain: true } });
  const clocks = breachClock(i);
  return (
    <Page title={i.title} intro={<>{i.severity} · {i.status} · detected {fmtDateTime(i.detectedAt)} UTC · recorded by {i.createdBy}</>}
      actions={i.personalData ? <Badge tone="bad">personal data</Badge> : undefined}>
      {clocks.length > 0 && (
        <Section title="Notification clocks">
          <ul className="space-y-1 text-sm" data-testid="clocks">{clocks.map((c) => <li key={c.label}><Badge tone={c.done ? "ok" : c.overdue ? "bad" : "warn"}>{c.done ? "done" : c.overdue ? "overdue" : "due"}</Badge> {c.label}</li>)}</ul>
        </Section>
      )}
      <Section title="Details">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted">Summary</dt><dd className="whitespace-pre-wrap">{i.summary || "—"}</dd>
          <dt className="text-muted">Systems</dt><dd>{i.systems.join(", ") || "—"}</dd>
          <dt className="text-muted">Affected firms</dt><dd>{firms.map((f) => `${f.name} (${f.emailDomain})`).join(", ") || "none"}</dd>
          <dt className="text-muted">Root cause</dt><dd>{i.rootCause ?? "—"}</dd>
          <dt className="text-muted">Resolved</dt><dd>{fmtDateTime(i.resolvedAt)}</dd>
        </dl>
      </Section>
      {a.can("incidents.manage") && i.status !== "closed" && (
        <Section title="Update">
          <ActionForm action={updateIncidentAction.bind(null, i.id)} className="grid max-w-3xl gap-3 md:grid-cols-2">
            <Field label="Status" name="status"><select name="status" aria-label="Status" defaultValue={i.status} className="w-full rounded border border-border bg-background px-3 py-2 text-sm">{["open", "contained", "resolved", "closed"].map((s) => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Root cause" name="rootCause" defaultValue={i.rootCause ?? ""} />
            <div className="md:col-span-2"><Field label="What happened / what was done" name="text"><textarea name="text" aria-label="What happened / what was done" rows={3} className="w-full rounded border border-border bg-transparent px-3 py-2 text-sm" /></Field></div>
            {i.personalData && i.firmIds.length > 0 && !i.firmsNotifiedAt && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="firmsNotified" /> Affected firms notified now</label>}
            {i.personalData && i.controllerData && !i.dpaNotifiedAt && !i.dpaNotRequiredReason && (
              <>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="dpaNotified" /> DPA notified now</label>
                <Field label="Or: why DPA notification is not required" name="dpaNotRequiredReason" hint="e.g. unlikely to result in a risk to individuals (Art. 33(1))" />
              </>
            )}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="public" defaultChecked={i.public} /> Show on the public status page</label>
            <Field label="Public summary (no personal data)" name="publicSummary" defaultValue={i.publicSummary ?? ""} />
            <div className="md:col-span-2"><Submit>Save update</Submit><StepUpLink /></div>
          </ActionForm>
        </Section>
      )}
      <Section title="Timeline">
        <Table head={["When", "By", "Update"]} rows={i.updates.map((u) => [fmtDateTime(u.at), u.authorEmail, <span key="t" className="whitespace-pre-wrap">{u.text}</span>])} empty="No updates yet." />
      </Section>
    </Page>
  );
}
