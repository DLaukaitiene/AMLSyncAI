import Link from "next/link";
import type { Metadata } from "next";
import { CONTACT_EMAIL, PLANS, SELF_SERVE_PLANS, TRIAL_DAYS } from "@/lib/billing/plans";
import { formatEur, TRIAL_CREDIT_CENTS } from "@/lib/didit/map";
import { currentPricesOrNull } from "@/lib/server/prices";
import { DEFAULT_LIMITS } from "@/lib/security/screening-caps";

export const metadata: Metadata = { title: "Pricing · AMLSync App", description: "Simple monthly plans billed by invoice: Solo €49 and Starter €149 a month, with a 14-day free trial. Identity checks, screening and company checks charged per check." };

export const revalidate = 3600;

export default async function Pricing() {
  const pr = await currentPricesOrNull();
  const eur = (c: number | undefined) => (c === undefined ? "price being updated" : formatEur(c));
  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold">Pricing</h1>
        <p className="max-w-2xl text-muted">
          {TRIAL_DAYS}-day free trial with {formatEur(TRIAL_CREDIT_CENTS)} credit for paid checks. Prices are in euro, excluding VAT, billed monthly by invoice. No card needed.
        </p>
      </section>
      <div className="grid gap-4 sm:grid-cols-3">
        {SELF_SERVE_PLANS.map((id) => {
          const p = PLANS[id];
          return (
            <section key={id} className="space-y-2 rounded-xl border border-border p-4">
              <h2 className="text-lg font-semibold">{p.name}</h2>
              <p><span className="text-2xl font-semibold">{formatEur(p.monthlyCents!)}</span> <span className="text-sm text-muted">per month</span></p>
              <p className="text-sm text-muted">{p.blurb}</p>
              <ul className="list-disc pl-5 text-sm">
                <li>Up to {p.users} users</li>
                <li>Client portal, risk scoring, hard gates, audit log</li>
                <li>EU and UN sanctions screening included</li>
                <li>Policies, firm risk assessment, training records</li>
              </ul>
              <Link href={`/signup?plan=${id}`} className="inline-block rounded-full bg-brand px-3 py-2 text-sm font-semibold text-brand-ink hover:brightness-105">Start free trial</Link>
            </section>
          );
        })}
        <section className="space-y-2 rounded-xl border border-border p-4">
          <h2 className="text-lg font-semibold">{PLANS.custom.name}</h2>
          <p className="text-2xl font-semibold">Contact sales</p>
          <p className="text-sm text-muted">More users, several offices, higher limits or an API.</p>
          <a href={`mailto:${CONTACT_EMAIL}`} className="inline-block rounded border border-border px-3 py-2 text-sm">{CONTACT_EMAIL}</a>
        </section>
      </div>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Paid checks (all plans)</h2>
        <ul className="list-disc pl-5 text-sm">
          <li>Remote identity check (national eID or ID document with chip, liveness, face match): {eur(pr?.idv)}</li>
          <li>PEP, sanctions and adverse-media screening: {eur(pr?.screen)}</li>
          <li>Company register check — company and status: {eur(pr?.kybLite)}; with full ownership (shareholders and beneficial owners): {eur(pr?.kybFull("LT"))} for Lithuanian companies (registers in other countries may differ)</li>
          <li>Company register searches: free up to your plan&apos;s allowance between orders (searches that find nothing don&apos;t count); 5 more searches: {eur(pr?.searchPack)}</li>
          <li>Prices excl. VAT, set from our supplier&apos;s US-dollar price at the European Central Bank&apos;s daily euro rate{pr ? ` (USD ${pr.rate.usdPerEur.toFixed(4)} per €1, ${pr.rate.date})` : ""}, so they can move by a few cents.</li>
          <li>Not charged if a check expires or fails. Each check has a statement with your client reference, so you can re-bill it.</li>
        </ul>
        <p className="text-sm text-muted">
          For your security, screenings are limited to {DEFAULT_LIMITS.perMinute} per minute, {DEFAULT_LIMITS.perDay} per day and {DEFAULT_LIMITS.perMonth} per month.
          Need more? Write to {CONTACT_EMAIL} and we adjust it within 1 business day.
        </p>
      </section>
    </div>
  );
}
