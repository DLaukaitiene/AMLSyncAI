import { notFound } from "next/navigation";
import { adminDb } from "@/lib/server/db";

/** Development-only inbox for EMAIL_TRANSPORT=dev. Not available in production. */
export default async function DevMailbox() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEV_EMAIL !== "1") notFound();
  const mails = await adminDb.devEmail.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-8">
      <h1 className="text-2xl font-semibold">Dev mailbox</h1>
      {mails.map((m) => (
        <article key={m.id} className="rounded-md border border-border p-4 text-sm" data-to={m.to}>
          <p className="text-muted">To {m.to} · {m.createdAt.toISOString()}</p>
          <h2 className="font-semibold">{m.subject}</h2>
          <pre className="whitespace-pre-wrap font-sans">{m.text}</pre>
        </article>
      ))}
    </main>
  );
}
