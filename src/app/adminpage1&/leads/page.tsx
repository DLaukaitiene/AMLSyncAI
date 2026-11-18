import Link from "next/link";
import { requireAdmin } from "@/lib/server/backoffice/access";
import { listLeads, unfinishedSignups } from "@/lib/server/backoffice/leads";
import { Badge, fmtDate, Page, Section, Table, Tile, Tiles } from "@/components/admin";
import { ActionForm, Field, Submit } from "@/components/form";
import { ActionButton } from "@/components/action-button";
import { StepUpLink } from "@/components/step-up";
import { LEAD_STAGES } from "@/lib/backoffice/ops";
import { createLeadAction, importSignupAction } from "./actions";

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ stage?: string; q?: string }> }) {
  await requireAdmin("leads.manage");
  const sp = await searchParams;
  const [leads, unfinished] = await Promise.all([listLeads(sp), unfinishedSignups()]);
  const today = new Date().toISOString().slice(0, 10);
  const by = (s: string) => leads.filter((l) => l.stage === s).length;
  const due = leads.filter((l) => l.nextStepOn && l.nextStepOn <= today && !["customer", "lost"].includes(l.stage));
  const sorted = [...leads].sort((a, b) => b.score - a.score);
  return (
    <Page title="Leads" intro="AMLSync's own light CRM: website enquiries, unfinished sign-ups and people you add. A lead becomes a trial or customer automatically when a firm signs up with the same email domain.">
      <Tiles>
        <Tile label="New" value={by("new")} />
        <Tile label="Contacted / demo" value={by("contacted") + by("demo")} />
        <Tile label="Trial / customer" value={`${by("trial")} / ${by("customer")}`} />
        <Tile label="Next steps due" value={due.length} tone={due.length ? "warn" : "ok"} />
      </Tiles>
      <form className="flex flex-wrap gap-2 text-sm" role="search">
        <input name="q" defaultValue={sp.q} placeholder="Name, email or company" aria-label="Search leads" className="rounded border border-border bg-background px-2 py-1" />
        <select name="stage" defaultValue={sp.stage ?? ""} aria-label="Stage" className="rounded border border-border bg-background px-2 py-1"><option value="">Any stage</option>{LEAD_STAGES.map((s) => <option key={s}>{s}</option>)}</select>
        <button className="rounded border border-border px-3 py-1">Filter</button>
      </form>
      <Table testId="lead-list" head={["Score", "Lead", "Company", "Source", "Stage", "Next step", "Page views", "Added"]} rows={sorted.map((l) => [
        <Badge key="s" tone={l.score >= 60 ? "ok" : l.score >= 30 ? "warn" : "neutral"}>{l.score}</Badge>,
        <span key="n"><Link href={`/adminpage1&/leads/${l.id}`} className="text-accent underline">{l.name}</Link><br /><span className="text-xs text-muted">{l.email}</span></span>,
        l.firm ? <Link key="c" href={`/adminpage1&/firms/${l.firm.id}`} className="underline">{l.firm.name}</Link> : l.company ?? "—",
        l.source, l.stage, l.nextStep ? `${l.nextStep}${l.nextStepOn ? ` (${l.nextStepOn})` : ""}` : "—", l.pageviews, fmtDate(l.createdAt),
      ])} empty="No leads yet. Website enquiries appear here automatically." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title={`Unfinished sign-ups (${unfinished.length})`} note="Started sign-up but never confirmed the email. Add them as leads to follow up.">
          <Table head={["Email", "Company", "Started", ""]} rows={unfinished.slice(0, 30).map((u) => [u.email, u.company || "—", fmtDate(u.createdAt), <ActionButton key="b" action={importSignupAction.bind(null, u.email)}>Add as lead</ActionButton>])} empty="None." />
        </Section>
        <Section title="Add a lead" note="E.g. from LinkedIn, Upwork, events or calls.">
          <ActionForm action={createLeadAction} className="grid gap-2 sm:grid-cols-2">
            <Field label="Name" name="name" required />
            <Field label="Email" name="email" required />
            <Field label="Company" name="company" />
            <Field label="Country (LT)" name="country" />
            <Field label="Interest" name="need" hint="e.g. AMLSync App, MLRO support" />
            <Field label="Source" name="source" defaultValue="manual" hint="manual, linkedin, upwork, event…" />
            <div className="sm:col-span-2"><Submit>Add lead</Submit><StepUpLink /></div>
          </ActionForm>
        </Section>
      </div>
    </Page>
  );
}
