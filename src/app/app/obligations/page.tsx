import Link from "next/link";
import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { can } from "@/lib/auth/permissions";
import { currentProfile } from "@/lib/server/country-profile";
import { firmObligations } from "@/lib/server/obligations";
import { OBLIGATIONS } from "@/lib/obligations/catalog";
import { sectorNote } from "@/lib/obligations/evaluate";
import { StateBadge } from "@/components/obligations";

/** Warning signs that should make anyone stop and report to the Compliance Officer (AMLR Annex III; FATF indicators). */
const WARNING_SIGNS = [
  "The client won't say where the money comes from, or the story doesn't add up.",
  "Large payments in cash, or cash split into smaller amounts.",
  "Someone else pays for the client, or money comes from or goes to an unrelated person.",
  "Money from or to a high-risk country, or through several countries for no clear reason.",
  "A company structure that is more complicated than the business needs, or hides who owns it.",
  "The client is in a hurry, avoids meeting, or is unusually unconcerned about price or fees.",
  "A deal far above or below market value, or quickly bought and resold.",
  "Information or documents that look false, or that the client won't provide.",
];

export default async function ObligationsPage() {
  const s = await requireUser();
  const data = await withTenant(s.firm.id, async (tx) => ({
    ob: await firmObligations(tx, s.firm.id, { seeCases: can(s.user.roles, "case.view") }),
    profile: (await currentProfile(tx, s.firm.id)).profile,
  }));
  const statusOf = new Map(data.ob.statuses.map((x) => [x.id, x]));
  const fiu = data.profile.fiu;
  return (
    <div className="max-w-4xl space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl">My Obligations</h1>
        <p className="text-muted">The EU Anti-Money Laundering Regulation (AMLR, Regulation (EU) 2024/1624) applies to your firm as an &ldquo;obliged entity&rdquo;. These are the duties it gives you, in plain words: what, when, and how to do each one in AMLSync App. Supervisors can fine firms and their managers that don&apos;t meet them.</p>
        <nav aria-label="Obligations" className="flex flex-wrap gap-2 pt-2 text-sm">
          {OBLIGATIONS.map((o) => <a key={o.id} href={`#${o.id}`} className="rounded-full border border-border px-3 py-1 hover:border-accent">{o.title}</a>)}
        </nav>
      </div>

      {OBLIGATIONS.map((o, i) => {
        const st = statusOf.get(o.id)!;
        const note = sectorNote(o, data.ob.input.sectors);
        return (
          <section key={o.id} id={o.id} className="scroll-mt-20 space-y-3 rounded-2xl border border-border bg-background p-6 shadow-[var(--shadow)]" data-testid="obligation-explained">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">{i + 1}. {o.group}</p>
                <h2 className="text-xl">{o.title}</h2>
              </div>
              <StateBadge state={st.state} />
            </div>
            <p className="text-sm font-medium">{st.detail}</p>
            <dl className="grid gap-3 text-sm sm:grid-cols-[9rem_1fr]">
              <dt className="font-semibold">What the law asks</dt><dd>{o.what}</dd>
              <dt className="font-semibold">When</dt><dd>{o.when}</dd>
              {note && (<><dt className="font-semibold">For your sector</dt><dd>{note}</dd></>)}
              <dt className="font-semibold">How, in AMLSync App</dt>
              <dd><ol className="list-decimal space-y-1 pl-5">{o.how.map((h) => <li key={h}>{h}</li>)}</ol></dd>
              <dt className="font-semibold">Legal basis</dt><dd className="text-muted">{o.article}</dd>
            </dl>
            {o.id === "reporting" && (
              <div className="space-y-3 rounded-xl border border-border bg-surface p-4 text-sm" data-testid="reporting-guide">
                <p><strong>Your FIU: </strong>{fiu ? <>{fiu.name} · send reports via {fiu.channel}</> : <>not recorded yet. <Link href="/app/settings/country-profile" className="text-accent underline">Add it in your Country Profile</Link> so you know where to report.</>}</p>
                <p><strong>Deadlines: </strong>report promptly once the Compliance Officer decides there are grounds; answer FIU requests within {data.profile.fiuRequestWorkingDays} working days; a reported transaction is held for 3 working days unless the FIU says otherwise. The app counts these for you in the Compliance Calendar.</p>
                <div>
                  <p className="font-semibold">Warning signs: stop and report if you see</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5">{WARNING_SIGNS.map((w) => <li key={w}>{w}</li>)}</ul>
                </div>
                <p><strong>Never tell the client</strong> that you reported or are thinking of reporting (tipping-off, AMLR Art. 73). Reporting in good faith is protected by law.</p>
              </div>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              {st.state !== "na" && <Link href={o.action.href} className="rounded-full bg-brand px-4 py-1.5 text-sm font-semibold text-brand-ink hover:brightness-105">{o.action.label}</Link>}
              {o.secondary && st.state !== "na" && <Link href={o.secondary.href} className="rounded-full border border-border px-3 py-1.5 text-sm hover:border-accent">{o.secondary.label}</Link>}
            </div>
          </section>
        );
      })}
      <p className="text-xs text-muted">This guide explains the EU rules in general terms and is not legal advice. National rules can add to them: your Country Profile holds your country&apos;s details.</p>
    </div>
  );
}
