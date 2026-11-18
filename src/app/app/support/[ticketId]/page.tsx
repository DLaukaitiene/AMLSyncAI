import { notFound } from "next/navigation";
import { requireUser } from "@/lib/server/session";
import { adminDb } from "@/lib/server/db";
import { ActionForm, Field, Submit } from "@/components/form";
import { rateAction, replyAction } from "../actions";

export default async function TicketPage({ params }: { params: Promise<{ ticketId: string }> }) {
  const s = await requireUser();
  const { ticketId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(ticketId)) notFound();
  const t = await adminDb.ticket.findUnique({ where: { id: ticketId }, include: { messages: { orderBy: { createdAt: "asc" } } } });
  if (!t || t.firmId !== s.firm.id) notFound();
  return (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-1">
        <p className="text-sm text-muted">#{t.number} · {t.category} · {t.priority} · {t.status}</p>
        <h1 className="text-2xl font-semibold">{t.subject}</h1>
      </div>
      <ol className="space-y-3" data-testid="thread">
        {t.messages.map((m) => (
          <li key={m.id} className={`rounded-xl border p-3 text-sm ${m.fromTeam ? "border-brand bg-brand/5" : "border-border"}`}>
            <p className="mb-1 text-xs text-muted">{m.fromTeam ? "AMLSync team" : m.authorEmail} · {m.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC</p>
            <p className="whitespace-pre-wrap">{m.text}</p>
          </li>
        ))}
      </ol>
      {t.status !== "closed" && (
        <ActionForm action={replyAction.bind(null, t.id)}>
          <Field label="Reply" name="text"><textarea name="text" aria-label="Reply" rows={4} className="w-full rounded border border-border bg-transparent px-3 py-2 text-sm" /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="confirmNoClientData" /> I confirm the text contains no client data</label>
          <Submit>Send reply</Submit>
        </ActionForm>
      )}
      {t.status === "resolved" && !t.csat && (
        <ActionForm action={rateAction.bind(null, t.id)} className="flex flex-wrap items-end gap-3">
          <Field label="How did we do? (1 = poor, 5 = excellent)" name="csat"><select name="csat" aria-label="Rating" defaultValue="5" className="rounded border border-border bg-background px-3 py-2 text-sm">{[5, 4, 3, 2, 1].map((n) => <option key={n}>{n}</option>)}</select></Field>
          <Submit variant="secondary">Rate and close</Submit>
        </ActionForm>
      )}
      {t.csat && <p className="text-sm text-muted">You rated this {t.csat}/5. Thank you.</p>}
    </div>
  );
}
