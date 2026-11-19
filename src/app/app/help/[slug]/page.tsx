import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/server/session";
import { HELP_ARTICLES } from "@/lib/help/articles";
import { HelpBody } from "@/components/help-body";

export default async function HelpArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  await requireUser();
  const { slug } = await params;
  const a = HELP_ARTICLES.find((x) => x.slug === slug);
  if (!a) notFound();
  const i = HELP_ARTICLES.indexOf(a);
  const prev = HELP_ARTICLES[i - 1], next = HELP_ARTICLES[i + 1];
  return (
    <article className="max-w-3xl space-y-5">
      <nav aria-label="Breadcrumb" className="text-sm text-muted"><Link href="/app/support" className="text-accent underline">Help Centre</Link> / {a.topic}</nav>
      <div>
        <h1 className="text-3xl">{a.title}</h1>
        <p className="text-muted">{a.summary}</p>
      </div>
      <HelpBody body={a.body} />
      <div className="flex flex-wrap justify-between gap-3 border-t border-border pt-4 text-sm">
        {prev ? <Link href={`/app/help/${prev.slug}`} className="text-accent underline">← {prev.title}</Link> : <span />}
        {next ? <Link href={`/app/help/${next.slug}`} className="text-accent underline">{next.title} →</Link> : <span />}
      </div>
      <p className="rounded-xl border border-border p-4 text-sm">Still need help? <Link href="/app/support#request" className="text-accent underline">Send us a request</Link>: we answer within 1 business day.</p>
    </article>
  );
}
