import Link from "next/link";
import type { Metadata } from "next";
import { Building2, Check, CreditCard, Fingerprint, Search, ShieldCheck, Sparkles } from "lucide-react";
import { CONTACT_EMAIL, PLANS, TRIAL_DAYS } from "@/lib/billing/plans";
import { formatEur, TRIAL_CREDIT_CENTS } from "@/lib/didit/map";
import { currentPricesOrNull } from "@/lib/server/prices";
import { PLAN_LIMITS, SCREEN_PACK } from "@/lib/security/screening-caps";
import { SEARCHES_BEFORE_ORDER } from "@/lib/didit/search-allowance";
import { AI_STR_CAP } from "@/lib/server/ai";
import { PAYMENT_TERMS_DAYS } from "@/lib/billing/invoice";

export const metadata: Metadata = { title: "Pricing · AMLSync App", description: "Simple monthly plans billed by invoice: Solo €49 and Starter €149 a month, with a 14-day free trial. Identity checks, screening and company checks charged per check." };

export const revalidate = 3600;

const INCLUDED = [
  "Client files for people, companies and trusts, with the ownership structure",
  "EU and UN sanctions screening, re-run every day",
  "Risk scoring, enhanced due diligence and approvals",
  "Client portal: clients fill in their details and sign",
  "Cases, transaction monitoring and FIU reporting",
  "AML policy, firm risk assessment and training records",
  "Audit trail, supervisor file and review pack",
  "Data stored in the EU, two-factor sign-in for everyone",
];

const euro = (cents: number) => `€${(cents / 100).toLocaleString("en-IE", { maximumFractionDigits: 0 })}`;

export default async function Pricing() {
  const pr = await currentPricesOrNull();
  const eur = (c: number | undefined) => (c === undefined ? "price being updated" : formatEur(c));
  const plans = [
    { id: "solo" as const, featured: false, cta: "Start free trial" },
    { id: "starter" as const, featured: true, cta: "Start free trial" },
  ];
  const card = "rounded-3xl border border-border bg-background p-6 shadow-[var(--shadow)]";
  const checks: { icon: typeof Fingerprint; title: string; price: string; text: string }[] = [
    { icon: Fingerprint, title: "Identity check", price: eur(pr?.idv), text: "National eID or ID document with its chip, liveness and face match. If the client uses Smart-ID or Mobile-ID, the lower price applies and the difference comes back as credit." },
    { icon: ShieldCheck, title: "PEP, sanctions and adverse-media screening", price: eur(pr?.screen), text: "A deeper check with our provider, on top of the EU and UN list screening that is always included." },
    { icon: Building2, title: "Company register: company and status", price: eur(pr?.kybLite), text: "Official identifiers, status, legal form, address and officers." },
    { icon: Building2, title: "Company register: full ownership", price: eur(pr?.kybFull("LT")), text: "Adds shareholders and beneficial owners (Lithuanian companies; registers in other countries may differ). If the register has no owner data, you pay the lower price." },
  ];
  const rows: [string, string, string, string][] = [
    ["Users", `Up to ${PLANS.solo.users}`, `Up to ${PLANS.starter.users}`, "Agreed with you"],
    ["Screenings started by hand", `${PLAN_LIMITS.solo.perMonth} a month · ${PLAN_LIMITS.solo.perDay} a day`, `${PLAN_LIMITS.starter.perMonth} a month · ${PLAN_LIMITS.starter.perDay} a day`, "Agreed with you"],
    ["Free company register searches between orders", String(SEARCHES_BEFORE_ORDER.solo), String(SEARCHES_BEFORE_ORDER.starter), "Agreed with you"],
    ["AI drafts of suspicious transaction reports", `${AI_STR_CAP.solo} a month`, `${AI_STR_CAP.starter} a month`, "Agreed with you"],
    ["Several offices or countries, API", "—", "—", "Yes"],
  ];
  const faqs: [string, string][] = [
    ["How does the free trial work?", `You get ${TRIAL_DAYS} days with everything in your plan and ${formatEur(TRIAL_CREDIT_CENTS)} of credit for paid checks. No card is needed. If you don't continue, nothing is charged.`],
    ["How am I billed?", `Once a month, by invoice: the plan fee plus the paid checks you used. Pay by bank transfer within ${PAYMENT_TERMS_DAYS} days. Each check has a statement with your client reference, so you can re-bill it to the client.`],
    ["What if a check fails or expires?", "You're not charged. A check that delivers less than ordered (for example, no owner data in the register) is charged at the lower price."],
    ["Why can the check prices change?", "Our provider charges in US dollars. We convert at the European Central Bank's daily rate and add a fixed margin, so prices move by a few cents at most."],
    ["Is VAT included?", "No, prices are excluding VAT. Lithuanian firms pay 21% VAT. Firms in other EU countries with a valid VAT number are invoiced under the reverse charge."],
    ["What happens if we stop?", "Your records stay available read-only for as long as AML law requires you to keep them, so you can still show them to a supervisor. You can download everything at any time."],
  ];

  return (
    <div className="space-y-16">
      {/* Hero */}
      <section className="space-y-4 text-center">
        <p className="text-sm font-semibold uppercase tracking-wider text-accent">Pricing</p>
        <h1 className="mx-auto max-w-3xl text-4xl sm:text-5xl">Simple pricing for AML compliance</h1>
        <p className="mx-auto max-w-2xl text-lg text-muted">One monthly plan for your firm, plus the checks you actually use. Billed by invoice, in euro.</p>
        <ul className="flex flex-wrap justify-center gap-2 text-sm">
          {[`${TRIAL_DAYS}-day free trial`, `${formatEur(TRIAL_CREDIT_CENTS)} credit for checks`, "No card needed", "Cancel any time"].map((x) => (
            <li key={x} className="flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1"><Check aria-hidden className="h-4 w-4 text-accent" />{x}</li>
          ))}
        </ul>
      </section>

      {/* Plans */}
      <section aria-labelledby="plans" className="space-y-4">
        <h2 id="plans" className="sr-only">Plans</h2>
        <div className="grid gap-5 lg:grid-cols-3">
          {plans.map(({ id, featured, cta }) => {
            const p = PLANS[id];
            return (
              <div key={id} className={`relative flex flex-col ${card} ${featured ? "ring-2 ring-accent" : ""}`} data-testid={`plan-${id}`}>
                {featured && <span className="absolute -top-3 left-6 rounded-full bg-accent px-3 py-0.5 text-xs font-semibold text-white">For teams</span>}
                <h3 className="text-xl font-semibold">{p.name}</h3>
                <p className="mt-1 text-sm text-muted">{p.blurb}</p>
                <p className="mt-5 flex items-baseline gap-1"><span className="font-[family-name:var(--font-heading)] text-5xl font-extrabold">{euro(p.monthlyCents!)}</span><span className="text-sm text-muted">/ month excl. VAT</span></p>
                <ul className="mt-5 space-y-2 text-sm">
                  <li className="flex gap-2"><Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-accent" />Up to {p.users} users</li>
                  <li className="flex gap-2"><Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-accent" />{PLAN_LIMITS[id].perMonth} screenings a month by hand</li>
                  <li className="flex gap-2"><Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-accent" />{SEARCHES_BEFORE_ORDER[id]} free register searches between orders</li>
                  <li className="flex gap-2"><Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-accent" />Everything listed below</li>
                </ul>
                <Link href={`/signup?plan=${id}`} className={`mt-6 rounded-full px-5 py-3 text-center text-sm font-semibold ${featured ? "bg-brand text-brand-ink hover:brightness-105" : "border border-accent text-accent hover:bg-accent/10"}`}>{cta}</Link>
              </div>
            );
          })}
          <div className={`flex flex-col ${card}`} data-testid="plan-custom">
            <h3 className="text-xl font-semibold">{PLANS.custom.name}</h3>
            <p className="mt-1 text-sm text-muted">More users, several offices or countries, higher limits or an API.</p>
            <p className="mt-5 font-[family-name:var(--font-heading)] text-3xl font-extrabold">Let&apos;s talk</p>
            <ul className="mt-5 space-y-2 text-sm">
              <li className="flex gap-2"><Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-accent" />Users and limits agreed with you</li>
              <li className="flex gap-2"><Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-accent" />Offices in several EU countries</li>
              <li className="flex gap-2"><Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-accent" />Help setting up and importing clients</li>
            </ul>
            <a href={`mailto:${CONTACT_EMAIL}?subject=AMLSync%20App%20pricing`} className="mt-auto rounded-full border border-border px-5 py-3 text-center text-sm font-semibold hover:border-accent">Contact us</a>
          </div>
        </div>
      </section>

      {/* Included */}
      <section aria-labelledby="included" className={`${card} space-y-4`}>
        <h2 id="included" className="text-2xl">Included in every plan</h2>
        <ul className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          {INCLUDED.map((x) => <li key={x} className="flex gap-2"><Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-accent" />{x}</li>)}
        </ul>
      </section>

      {/* Compare */}
      <section aria-labelledby="compare" className="space-y-4">
        <h2 id="compare" className="text-2xl">Compare plans</h2>
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[36rem] text-left text-sm" data-testid="compare">
            <thead className="bg-surface">
              <tr><th className="px-4 py-3 font-semibold" scope="col"><span className="sr-only">Feature</span></th>{[PLANS.solo.name, PLANS.starter.name, PLANS.custom.name].map((n) => <th key={n} scope="col" className="px-4 py-3 font-semibold">{n}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              <tr><th scope="row" className="px-4 py-3 font-medium">Monthly fee (excl. VAT)</th><td className="px-4 py-3">{formatEur(PLANS.solo.monthlyCents!)}</td><td className="px-4 py-3">{formatEur(PLANS.starter.monthlyCents!)}</td><td className="px-4 py-3">Quoted</td></tr>
              {rows.map(([label, a, b, c]) => <tr key={label}><th scope="row" className="px-4 py-3 font-medium">{label}</th><td className="px-4 py-3">{a}</td><td className="px-4 py-3">{b}</td><td className="px-4 py-3">{c}</td></tr>)}
            </tbody>
          </table>
        </div>
      </section>

      {/* Pay per check */}
      <section aria-labelledby="checks" className="space-y-4">
        <div className="space-y-1">
          <h2 id="checks" className="text-2xl">Pay only for the checks you run</h2>
          <p className="text-sm text-muted">Same price on every plan, excl. VAT. Not charged if a check expires or fails.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {checks.map(({ icon: Icon, title, price, text }) => (
            <div key={title} className="flex gap-4 rounded-2xl border border-border bg-background p-5" data-testid="check-price">
              <Icon aria-hidden className="mt-1 h-6 w-6 shrink-0 text-accent" />
              <div className="space-y-1">
                <p className="flex flex-wrap items-baseline justify-between gap-x-3"><span className="font-semibold">{title}</span><span className="font-[family-name:var(--font-heading)] text-xl font-extrabold">{price}</span></p>
                <p className="text-sm text-muted">{text}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex gap-4 rounded-2xl border border-dashed border-border p-5"><Search aria-hidden className="mt-1 h-6 w-6 shrink-0 text-accent" /><div><p className="font-semibold">5 more register searches · {eur(pr?.searchPack)}</p><p className="text-sm text-muted">Searches that find nothing don&apos;t count, and ordering a check resets your free searches.</p></div></div>
          <div className="flex gap-4 rounded-2xl border border-dashed border-border p-5"><CreditCard aria-hidden className="mt-1 h-6 w-6 shrink-0 text-accent" /><div><p className="font-semibold">{SCREEN_PACK.screenings} more screenings · {formatEur(SCREEN_PACK.cents)}</p><p className="text-sm text-muted">Bought in the app when you reach your limit, usable at once.</p></div></div>
        </div>
        <p className="text-xs text-muted">Check prices follow our provider&apos;s US-dollar price at the European Central Bank&apos;s daily rate{pr ? ` (USD ${pr.rate.usdPerEur.toFixed(4)} per €1, ${pr.rate.date})` : ""}, so they can move by a few cents.</p>
      </section>

      {/* FAQ */}
      <section aria-labelledby="faq" className="space-y-4">
        <h2 id="faq" className="text-2xl">Questions</h2>
        <div className="divide-y divide-border rounded-2xl border border-border bg-background">
          {faqs.map(([q, a]) => (
            <details key={q} className="group px-5 py-4">
              <summary className="cursor-pointer list-none font-semibold marker:hidden"><span className="flex items-center justify-between gap-4">{q}<span aria-hidden className="text-accent transition group-open:rotate-45">+</span></span></summary>
              <p className="mt-2 text-sm text-muted">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="flex flex-col items-center gap-4 rounded-3xl bg-navy px-6 py-12 text-center text-white">
        <Sparkles aria-hidden className="h-7 w-7 text-brand" />
        <h2 className="text-3xl text-white">Try it with your own clients</h2>
        <p className="max-w-xl text-white/75">{TRIAL_DAYS} days free with {formatEur(TRIAL_CREDIT_CENTS)} of credit for checks. Set up in minutes, no card needed.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/signup?plan=starter" className="rounded-full bg-brand px-6 py-3 text-sm font-semibold text-brand-ink hover:brightness-105">Start free trial</Link>
          <a href={`mailto:${CONTACT_EMAIL}`} className="rounded-full border border-white/30 px-6 py-3 text-sm font-semibold text-white hover:border-white">Talk to us</a>
        </div>
      </section>
    </div>
  );
}
