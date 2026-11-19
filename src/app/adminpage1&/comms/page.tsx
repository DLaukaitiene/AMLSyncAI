import { requireAdmin } from "@/lib/server/backoffice/access";
import { adminDb } from "@/lib/server/db";
import { Badge, fmtDateTime, Page, Section, Table } from "@/components/admin";
import { ActionForm, Field, Submit } from "@/components/form";
import { ActionButton } from "@/components/action-button";
import { StepUpLink } from "@/components/step-up";
import { createAnnouncementAction, endAnnouncementAction } from "./actions";

const sel = "w-full rounded border border-border bg-background px-3 py-2 text-sm";

export default async function CommsPage() {
  await requireAdmin("comms.manage");
  const now = new Date();
  const rows = await adminDb.announcement.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { _count: { select: { dismissals: true } } } });
  return (
    <Page title="Communications" intro="Service messages to firms: an in-app banner for every user of the selected firms, and optionally an email to their Owners and Compliance Officers. Emails to all firms need approval. Marketing newsletters need consent and are not sent from here.">
      <Section title="New message">
        <ActionForm action={createAnnouncementAction} className="grid max-w-4xl gap-3 md:grid-cols-4">
          <div className="md:col-span-4"><Field label="Title" name="title" required /></div>
          <div className="md:col-span-4"><Field label="Message" name="body"><textarea name="body" aria-label="Message" rows={4} className="w-full rounded border border-border bg-transparent px-3 py-2 text-sm" /></Field></div>
          <Field label="Country (empty = all)" name="country" />
          <Field label="Plan" name="plan"><select name="plan" aria-label="Plan" className={sel}><option value="">All plans</option><option>solo</option><option>starter</option><option>custom</option></select></Field>
          <Field label="Status" name="status"><select name="status" aria-label="Status" className={sel}><option value="">All statuses</option><option>active</option><option>paused</option><option>suspended</option></select></Field>
          <Field label="Sector" name="sector"><select name="sector" aria-label="Sector" className={sel}><option value="">All sectors</option>{["ACCOUNTANT", "ESTATE_AGENT", "HVG_TRADER", "PRECIOUS_METALS", "TCSP", "LEGAL", "ART_TRADER", "GAMBLING", "CROWDFUNDING", "CREDIT_INTERMEDIARY", "INVESTMENT_MIGRATION", "FOOTBALL", "OTHER"].map((s) => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Style" name="level"><select name="level" aria-label="Style" className={sel}><option value="info">Information</option><option value="warning">Important</option></select></Field>
          <Field label="Show until (YYYY-MM-DD, empty = until removed)" name="endsOn" />
          <label className="flex items-center gap-2 self-end text-sm md:col-span-2"><input type="checkbox" name="email" /> Also email Owners and Compliance Officers</label>
          <div className="md:col-span-4"><Submit>Publish</Submit><StepUpLink /></div>
        </ActionForm>
      </Section>
      <Section title="Messages">
        <Table testId="announcements" head={["Created", "Title", "Audience", "Banner", "Email", "Dismissed by", ""]} rows={rows.map((a) => {
          const live = a.startsAt <= now && (!a.endsAt || a.endsAt > now);
          const aud = Object.entries(a.audience as Record<string, string>).map(([k, v]) => `${k}: ${v}`).join(", ") || "all firms";
          return [fmtDateTime(a.createdAt), <span key="t">{a.level === "warning" && <Badge tone="warn">important</Badge>} {a.title}</span>, aud, live ? <Badge key="l" tone="ok">live</Badge> : "ended", a.email ? `${a.emailState}${a.emailCount ? ` (${a.emailCount})` : ""}` : "—", `${a._count.dismissals} user(s)`,
            live ? <ActionButton key="e" action={endAnnouncementAction.bind(null, a.id)}>Remove banner</ActionButton> : ""];
        })} empty="No messages yet." />
      </Section>
    </Page>
  );
}
