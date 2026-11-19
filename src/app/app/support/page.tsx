import Link from "next/link";
import { requireUser } from "@/lib/server/session";
import { adminDb } from "@/lib/server/db";
import { ActionForm, Field, Submit } from "@/components/form";
import { CATEGORIES, CATEGORY_LABELS } from "@/lib/server/tickets";
import { createTicketAction } from "./actions";

export default async function SupportPage() {
  const s = await requireUser();
  const tickets = await adminDb.ticket.findMany({ where: { firmId: s.firm.id }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, number: true, subject: true, status: true, createdAt: true, userId: true } });
  return (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Help Centre</h1>
        <p className="text-sm text-muted">Ask the AMLSync team. We answer blocking problems within 1 hour and other questions within 1 business day. Describe the problem without client names, ID numbers or case details: AMLSync never needs your clients&apos; data to help.</p>
      </div>
      <section className="space-y-2">
        <h2 className="font-semibold">Your firm&apos;s requests</h2>
        <ul className="divide-y divide-border rounded-xl border border-border text-sm" data-testid="tickets">
          {tickets.map((t) => <li key={t.id} className="flex flex-wrap justify-between gap-2 px-4 py-2"><Link href={`/app/support/${t.id}`} className="text-accent underline">#{t.number} {t.subject}</Link><span className="text-muted">{t.status} · {t.createdAt.toISOString().slice(0, 10)}</span></li>)}
          {!tickets.length && <li className="px-4 py-2 text-muted">No requests yet.</li>}
        </ul>
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">New request</h2>
        <ActionForm action={createTicketAction}>
          <Field label="Subject" name="subject" required />
          <Field label="Topic" name="category"><select name="category" aria-label="Topic" className="w-full rounded border border-border bg-background px-3 py-2 text-sm">{CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}</select></Field>
          <Field label="What happened?" name="text"><textarea name="text" aria-label="What happened?" rows={5} className="w-full rounded border border-border bg-transparent px-3 py-2 text-sm" /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="blocking" /> This stops us from onboarding clients or meeting a deadline</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="confirmNoClientData" /> I confirm the text contains no client data</label>
          <Submit>Send to AMLSync</Submit>
        </ActionForm>
        <p className="text-xs text-muted">Advice on your own risk decisions is part of AMLSync Expert (paid); decisions always stay with your firm.</p>
      </section>
    </div>
  );
}
