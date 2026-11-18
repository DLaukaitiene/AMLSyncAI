import Link from "next/link";
import { requireAdmin } from "@/lib/server/backoffice/access";
import { adminDb } from "@/lib/server/db";
import { Badge, eur, Page, Section, Table, Tile, Tiles } from "@/components/admin";
import { ActionForm, Field, Submit } from "@/components/form";
import { ActionButton } from "@/components/action-button";
import { StepUpLink } from "@/components/step-up";
import { addTaskAction, createEngagementAction, endEngagementAction, updateTaskAction } from "./actions";

export default async function ExpertPage() {
  await requireAdmin("expert.manage");
  const engagements = await adminDb.expertEngagement.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], include: { tasks: { orderBy: [{ status: "asc" }, { dueOn: "asc" }] } } });
  const firms = new Map((await adminDb.firm.findMany({ where: { id: { in: engagements.map((e) => e.firmId) } }, select: { id: true, name: true } })).map((f) => [f.id, f.name]));
  const today = new Date().toISOString().slice(0, 10);
  const open = engagements.flatMap((e) => e.tasks).filter((t) => t.status !== "done");
  const minutes = engagements.flatMap((e) => e.tasks).reduce((s, t) => s + t.minutes, 0);
  const billable = engagements.reduce((s, e) => s + (e.hourlyCents ? (e.tasks.reduce((m, t) => m + t.minutes, 0) / 60) * e.hourlyCents : 0), 0);
  return (
    <Page title="AMLSync Expert" intro="Managed-service work under AMLR Art. 18 outsourcing agreements. Analysts work inside the firm's workspace with a role the firm grants (External reviewer); decisions on onboarding, risk and suspicion reports stay with the firm. Keep client names out of task titles: use the firm's file reference.">
      <Tiles>
        <Tile label="Active engagements" value={engagements.filter((e) => e.status === "active").length} />
        <Tile label="Open tasks" value={open.length} sub={`${open.filter((t) => t.dueOn && t.dueOn < today).length} overdue`} tone={open.some((t) => t.dueOn && t.dueOn < today) ? "warn" : "ok"} />
        <Tile label="Time logged" value={`${(minutes / 60).toFixed(1)} h`} />
        <Tile label="Billable value" value={eur(Math.round(billable))} sub="at agreed hourly rates" />
      </Tiles>
      {engagements.map((e) => (
        <Section key={e.id} title={`${firms.get(e.firmId) ?? "—"} — ${e.scope}`} note={<>Art. 18 agreement {e.agreementOn} · supervisor notified: {e.supervisorNotified ? "yes" : <Badge tone="warn">not confirmed</Badge>} · {e.hourlyCents ? `${eur(e.hourlyCents)}/h` : "no rate"} · {e.status} · <Link href={`/adminpage1&/firms/${e.firmId}`} className="underline">firm</Link></>}>
          <Table head={["Task", "Due", "Analyst", "Time", "Update"]} rows={e.tasks.map((t) => [t.title, t.dueOn ? (t.dueOn < today && t.status !== "done" ? <Badge key="d" tone="bad">{t.dueOn}</Badge> : t.dueOn) : "—", t.analyst ?? "—", `${t.minutes} min`,
            <ActionForm key="u" action={updateTaskAction.bind(null, t.id)} className="flex flex-wrap items-end gap-2">
              <select name="status" aria-label="Status" defaultValue={t.status} className="rounded border border-border bg-background px-2 py-1 text-sm">{["todo", "in-progress", "review", "done"].map((s) => <option key={s}>{s}</option>)}</select>
              <input name="minutes" type="number" min={0} max={600} placeholder="+ min" aria-label="Minutes to add" className="w-20 rounded border border-border bg-transparent px-2 py-1 text-sm" />
              <Submit variant="secondary">Save</Submit>
            </ActionForm>])} empty="No tasks yet." />
          {e.status === "active" && (
            <div className="flex flex-wrap items-start gap-6">
              <ActionForm action={addTaskAction.bind(null, e.id)} className="flex flex-wrap items-end gap-2">
                <Field label="New task" name="title" required />
                <Field label="Due (YYYY-MM-DD)" name="dueOn" />
                <Field label="Analyst" name="analyst" />
                <Submit variant="secondary">Add</Submit><StepUpLink />
              </ActionForm>
              <ActionButton action={endEngagementAction.bind(null, e.id)}>End engagement</ActionButton>
            </div>
          )}
        </Section>
      ))}
      <Section title="New engagement">
        <ActionForm action={createEngagementAction} className="grid max-w-3xl gap-3 md:grid-cols-2">
          <Field label="Firm email domain" name="domain" required />
          <Field label="Scope" name="scope" required hint="e.g. back-book remediation, EDD memo drafts" />
          <Field label="Art. 18 agreement signed on (YYYY-MM-DD)" name="agreementOn" required />
          <Field label="Hourly rate (EUR, excl. VAT)" name="rate" type="number" />
          <label className="flex items-center gap-2 text-sm md:col-span-2"><input type="checkbox" name="supervisorNotified" /> The firm confirmed it notified its supervisor (where required)</label>
          <div className="md:col-span-2"><Submit>Record engagement</Submit><StepUpLink /></div>
        </ActionForm>
      </Section>
    </Page>
  );
}
