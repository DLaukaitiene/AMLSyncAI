import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/server/backoffice/access";
import { adminDb } from "@/lib/server/db";
import { listLeads } from "@/lib/server/backoffice/leads";
import { Badge, fmtDateTime, Page, Section, Table } from "@/components/admin";
import { ActionForm, Field, Submit } from "@/components/form";
import { ActionButton } from "@/components/action-button";
import { StepUpLink } from "@/components/step-up";
import { LEAD_STAGES } from "@/lib/backoffice/ops";
import { addLeadNoteAction, deleteLeadAction, updateLeadAction } from "../actions";

export default async function LeadPage({ params }: { params: Promise<{ leadId: string }> }) {
  await requireAdmin("leads.manage");
  const { leadId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(leadId)) notFound();
  const raw = await adminDb.lead.findUnique({ where: { id: leadId }, include: { notes: { orderBy: { createdAt: "desc" } } } });
  if (!raw) notFound();
  const l = (await listLeads({ q: raw.email })).find((x) => x.id === leadId)!;
  const visits = raw.visitor ? await adminDb.webEvent.findMany({ where: { visitor: raw.visitor }, orderBy: { at: "asc" }, take: 50, select: { at: true, path: true, kind: true, name: true, referrer: true } }) : [];
  const sel = "w-full rounded border border-border bg-background px-3 py-2 text-sm";
  return (
    <Page title={raw.name} intro={<>{raw.email}{raw.company ? ` · ${raw.company}` : ""}{raw.country ? ` · ${raw.country}` : ""} · {raw.source} · added {fmtDateTime(raw.createdAt)}</>}
      actions={<span className="flex gap-2"><Badge tone={l.score >= 60 ? "ok" : "neutral"}>score {l.score}</Badge><Badge>{l.stage}</Badge></span>}>
      <p className="text-sm text-muted">Score: {l.reasons.join(", ") || "—"}{l.firm ? <> · signed up as <Link href={`/adminpage1&/firms/${l.firm.id}`} className="underline">{l.firm.name}</Link></> : ""}</p>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Enquiry">
          <p className="text-sm">Interest: {raw.need ?? "—"}</p>
          <p className="whitespace-pre-wrap rounded border border-border p-3 text-sm">{raw.message ?? "No message."}</p>
          <p className="text-sm"><a className="text-accent underline" href={`mailto:${raw.email}?subject=${encodeURIComponent("Your enquiry to AMLSync")}`}>Email {raw.email}</a></p>
        </Section>
        <Section title="Pipeline">
          <ActionForm action={updateLeadAction.bind(null, raw.id)} className="grid gap-2 sm:grid-cols-2">
            <Field label="Stage" name="stage"><select name="stage" aria-label="Stage" defaultValue={raw.stage} className={sel}>{LEAD_STAGES.map((s) => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Owner" name="owner" defaultValue={raw.owner ?? ""} />
            <Field label="Next step" name="nextStep" defaultValue={raw.nextStep ?? ""} />
            <Field label="Next step on (YYYY-MM-DD)" name="nextStepOn" defaultValue={raw.nextStepOn ?? ""} />
            <div className="sm:col-span-2"><Field label="Lost reason" name="lostReason" defaultValue={raw.lostReason ?? ""} /></div>
            <div className="sm:col-span-2"><Submit>Save</Submit><StepUpLink /></div>
          </ActionForm>
        </Section>
        <Section title="Notes">
          <ActionForm action={addLeadNoteAction.bind(null, raw.id)} className="space-y-2">
            <Field label="Note" name="text"><textarea name="text" aria-label="Note" rows={3} className="w-full rounded border border-border bg-transparent px-3 py-2 text-sm" /></Field>
            <Submit variant="secondary">Add note</Submit><StepUpLink />
          </ActionForm>
          <ul className="space-y-2 text-sm">{raw.notes.map((n) => <li key={n.id} className="rounded border border-border p-2"><p className="whitespace-pre-wrap">{n.text}</p><p className="text-xs text-muted">{n.authorEmail} · {fmtDateTime(n.createdAt)}</p></li>)}</ul>
        </Section>
        <Section title="Website visit (day of the enquiry)" note="Visitor codes change daily, so only the visit on the day of the enquiry is linked.">
          <Table head={["When", "What", "From"]} rows={visits.map((v) => [fmtDateTime(v.at), v.kind === "event" ? `event: ${v.name}` : v.path, v.referrer ?? "—"])} empty="No linked visit." />
        </Section>
      </div>
      <Section title="Erase" note="For a GDPR erasure request or when someone asks not to be contacted.">
        <ActionButton action={deleteLeadAction.bind(null, raw.id)} variant="danger">Delete lead and notes</ActionButton>
      </Section>
    </Page>
  );
}
