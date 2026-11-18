import { notFound } from "next/navigation";
import { adminDb } from "@/lib/server/db";
import { safeEqual } from "@/lib/server/crypto";

/** Development-only inbox for EMAIL_TRANSPORT=dev. Not available in production. */
/** On a shared test deployment, DEV_MAILBOX_TOKEN must be given as ?token=… */
export default async function DevMailbox({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEV_EMAIL !== "1") notFound();
  const need = process.env.DEV_MAILBOX_TOKEN;
  if (need && !safeEqual((await searchParams).token ?? "", need)) notFound();
  const mails = await adminDb.devEmail.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-8">
      <h1 className="text-2xl font-semibold">Dev mailbox</h1>
      {mails.map((m) => (
        <article key={m.id} className="rounded-xl border border-border p-4 text-sm" data-to={m.to}>
          <p className="text-muted">To {m.to} · {m.createdAt.toISOString()}</p>
          <h2 className="font-semibold">{m.subject}</h2>
          <pre className="whitespace-pre-wrap font-sans">{m.text}</pre>
        </article>
      ))}
    </main>
  );
}
