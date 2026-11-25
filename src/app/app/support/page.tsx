import Link from "next/link";
import { HELP_ARTICLES, HELP_TOPICS, searchHelp } from "@/lib/help/articles";
import { requireUser } from "@/lib/server/session";
import { adminDb } from "@/lib/server/db";
import { ActionForm, Field, Submit } from "@/components/form";
import { CATEGORIES, CATEGORY_LABELS } from "@/lib/server/tickets";
import { createTicketAction } from "./actions";
import { PageTitle, Help } from "@/components/help";

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const s = await requireUser();
  const q = (await searchParams).q?.trim().slice(0, 100) ?? "";
  const found = q ? searchHelp(q) : [];
  const tickets = await adminDb.ticket.findMany({ where: { firmId: s.firm.id }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, number: true, subject: true, status: true, createdAt: true, userId: true } });
  return (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-1">
        <PageTitle className="text-3xl" help={<>Guides for every part of the app, and a direct line to the AMLSync team.</>}>Help Centre</PageTitle>
      </div>
      <form role="search" aria-label="Search help articles" className="flex gap-2">
        <input name="q" defaultValue={q} placeholder="Search help, e.g. screening, invoice, trust" aria-label="Search help articles" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        <button className="rounded-full border border-border px-4 py-2 text-sm hover:border-accent">Search</button>
      </form>
      {q ? (
        <section className="space-y-2" data-testid="help-results">
          <h2 className="font-semibold">{found.length ? `Results for “${q}”` : `Nothing found for “${q}”. Try other words or send us a request below.`}</h2>
          <ul className="divide-y divide-border rounded-xl border border-border text-sm">
            {found.map((a) => <li key={a.slug} className="px-4 py-2"><Link href={`/app/help/${a.slug}`} className="font-medium text-accent hover:underline">{a.title}</Link><span className="block text-muted">{a.summary}</span></li>)}
          </ul>
        </section>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2" data-testid="help-topics">
          {HELP_TOPICS.map((t) => (
            <section key={t} className="space-y-2 rounded-2xl border border-border p-4">
              <h2 className="font-semibold">{t}</h2>
              <ul className="space-y-1 text-sm">{HELP_ARTICLES.filter((a) => a.topic === t).map((a) => <li key={a.slug}><Link href={`/app/help/${a.slug}`} className="text-accent hover:underline">{a.title}</Link></li>)}</ul>
            </section>
          ))}
        </div>
      )}
      <div className="space-y-1" id="request">
        <h2 className="text-lg font-semibold">Contact support</h2>
        <div className="flex items-start gap-2 text-sm text-muted"><p>Ask the AMLSync team. Don&apos;t include client names or ID numbers.</p><Help>We answer blocking problems within 1 hour and other questions within 1 business day. AMLSync never needs your clients&apos; data to help, so leave out names, ID numbers and case details.</Help></div>
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
