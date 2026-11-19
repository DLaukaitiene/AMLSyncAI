import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/server/backoffice/access";
import { adminDb } from "@/lib/server/db";
import { Badge, fmtDateTime, Page, Section } from "@/components/admin";
import { ActionForm, Field, Submit } from "@/components/form";
import { StepUpLink } from "@/components/step-up";
import { planOf } from "@/lib/billing/plans";
import { teamReplyAction } from "../actions";

export default async function TicketPage({ params }: { params: Promise<{ ticketId: string }> }) {
  await requireAdmin("tickets.manage");
  const { ticketId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(ticketId)) notFound();
  const t = await adminDb.ticket.findUnique({ where: { id: ticketId }, include: { messages: { orderBy: { createdAt: "asc" } } } });
  if (!t) notFound();
  const [firm, user, errors] = await Promise.all([
    adminDb.firm.findUnique({ where: { id: t.firmId }, select: { id: true, name: true, plan: true, status: true, homeState: true } }),
    adminDb.user.findUnique({ where: { id: t.userId }, select: { id: true, name: true, email: true, roles: true } }),
    adminDb.securityEvent.groupBy({ by: ["kind"], where: { firmId: t.firmId, at: { gte: new Date(Date.now() - 7 * 86_400_000) }, kind: { in: ["login-failed", "rate-limit", "bot-block", "email-failed", "webhook-rejected"] } }, _count: true }),
  ]);
  return (
    <Page title={`#${t.number} ${t.subject}`} intro={<>{t.category} · opened {fmtDateTime(t.createdAt)} UTC · first response due {fmtDateTime(t.slaDueAt)}</>}
      actions={<span className="flex gap-2"><Badge tone={t.priority === "P1" ? "bad" : "warn"}>{t.priority}</Badge><Badge>{t.status}</Badge>{t.csat && <Badge tone="ok">CSAT {t.csat}/5</Badge>}</span>}>
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Section title="Conversation">
          <ol className="space-y-3">{t.messages.map((m) => <li key={m.id} className={`rounded-md border p-3 text-sm ${m.fromTeam ? "border-accent" : "border-border"}`}><p className="mb-1 text-xs text-muted">{m.fromTeam ? `AMLSync (${m.authorEmail})` : m.authorEmail} · {fmtDateTime(m.createdAt)}</p><p className="whitespace-pre-wrap">{m.text}</p></li>)}</ol>
          <ActionForm action={teamReplyAction.bind(null, t.id)} className="space-y-2">
            <Field label="Reply to the customer (emailed)" name="text"><textarea name="text" aria-label="Reply to the customer" rows={5} className="w-full rounded border border-border bg-transparent px-3 py-2 text-sm" /></Field>
            <Field label="Status after reply" name="status"><select name="status" aria-label="Status after reply" defaultValue="resolved" className="rounded border border-border bg-background px-3 py-2 text-sm">{["open", "waiting-customer", "resolved", "closed"].map((s) => <option key={s}>{s}</option>)}</select></Field>
            <Submit>Send</Submit><StepUpLink />
          </ActionForm>
        </Section>
        <Section title="Context (metadata only)">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted">Firm</dt><dd>{firm ? <Link href={`/adminpage1&/firms/${firm.id}`} className="underline">{firm.name}</Link> : "—"}</dd>
            <dt className="text-muted">Plan / status</dt><dd>{firm ? `${planOf(firm.plan).name} · ${firm.status} · ${firm.homeState}` : "—"}</dd>
            <dt className="text-muted">User</dt><dd>{user ? <Link href={`/adminpage1&/users/${user.id}`} className="underline">{user.name}</Link> : "—"}<br /><span className="text-xs text-muted">{user?.email} · {user?.roles.join(", ")}</span></dd>
            <dt className="text-muted">Problems (7 d)</dt><dd>{errors.length ? errors.map((e) => `${e.kind} ×${e._count}`).join(", ") : "none logged"}</dd>
          </dl>
          <p className="text-sm"><Link href="/adminpage1&/support" className="text-accent underline">Request consented access to the firm</Link> if you need to see its screens.</p>
          <p className="text-xs text-muted">Advisory questions (how to apply a rule to a client) go to AMLSync Expert; risk decisions stay with the firm (AMLR Art. 18).</p>
        </Section>
      </div>
    </Page>
  );
}
