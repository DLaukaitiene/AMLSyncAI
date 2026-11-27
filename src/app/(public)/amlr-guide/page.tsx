import Link from "next/link";
import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { EU_CORE } from "@/lib/rules/eu-core";

export const metadata: Metadata = {
  title: "AMLR 2027 Guide · AMLSync App",
  description: "From 10 July 2027 the EU AML Regulation applies to accountants, real estate agents, lawyers, high-value goods traders and other non-financial firms. Who is covered, what you must do and how to get ready.",
};

// Recompute the countdown once a day.
export const revalidate = 86400;

const eur = (n: number) => `€${n.toLocaleString("en-IE")}`;
const c = EU_CORE;

const WHO: [string, string][] = [
  ["External accountants, auditors and tax advisors", "All clients you advise or keep books for."],
  ["Real estate agents", "Sales, and lettings with a monthly rent of " + eur(c.cdd.lettingMonthlyRentEUR) + " or more. Due diligence on both buyer and seller."],
  ["Lawyers and notaries", "When you act in property or company deals, hold client money, or set up companies and trusts."],
  ["Trust and company service providers", "Company formation, registered office, nominee and trust services."],
  ["Traders in high-value goods", `Jewellery and watches over ${eur(10_000)}, motor vehicles over ${eur(c.reporting.motorVehicleEUR)}, aircraft and boats over ${eur(c.reporting.aircraftWatercraftEUR)}; precious metals and stones. Due diligence on customers and suppliers.`],
  ["Art and cultural goods traders", `Galleries, auction houses and free zones, for deals of ${eur(c.cdd.artEUR)} or more.`],
  ["Professional football clubs and agents", "Covered from 10 July 2029: player transfers, investors, sponsors and agents."],
];

const DUTIES: [string, string][] = [
  ["Firm risk assessment", "Write down how your firm could be used for money laundering, given your clients, services, countries and channels, and keep it up to date."],
  ["Policies and a responsible person", "Written AML policies and controls, a compliance officer, and a member of management who answers for AML compliance."],
  ["Know your client", "Identify and verify each client and anyone acting for them, understand the purpose of the relationship, and assess its risk."],
  ["Beneficial owners", `Work out who owns or controls a company: ${c.beneficialOwnership.thresholdPct}% or more of shares or votes, or control by other means. Report differences you find in the beneficial ownership register within ${c.reporting.discrepancyCalendarDays} days.`],
  ["Sanctions and PEP checks", `Screen clients and their owners against EU sanctions and for politically exposed persons. Companies more than ${c.sanctions.ownershipAggregationPct}% owned by sanctioned people are treated as sanctioned.`],
  ["Enhanced due diligence", "Extra checks and management approval for high-risk clients, PEPs and links to high-risk countries, including source of funds and wealth."],
  ["Keep files up to date", `Refresh client information at least every year for high-risk clients and every ${c.monitoring.refreshYearsStandard} years for everyone else, and watch transactions for anything unusual.`],
  ["Report suspicions", `Report suspicious activity to your national FIU, answer its requests within ${c.reporting.fiuRequestWorkingDays} working days, and never tip off the client.`],
  ["Cash limit", `No cash payments of ${eur(c.cash.capEUR)} or more for goods or services across the EU. Some countries set a lower limit.`],
  ["Records and training", "Keep client files and decisions for at least 5 years, and train staff on the rules."],
];

const STEPS = [
  "Check whether your firm, and which of your services, are in scope.",
  "Name a compliance officer and the manager responsible for AML.",
  "Write or update your firm-wide risk assessment.",
  "Update your AML policies, procedures and onboarding forms to AMLR.",
  "Set up identity checks, beneficial-owner checks and sanctions/PEP screening.",
  "Review existing client files: many will need refreshing to the new standard.",
  "Find out your national supervisor and FIU reporting channel.",
  "Train your staff before 10 July 2027.",
];

function daysUntil(iso: string) {
  return Math.max(0, Math.ceil((Date.parse(iso + "T00:00:00Z") - Date.now()) / 86_400_000));
}

export default function AmlrGuide() {
  const days = daysUntil(c.applicationDate);
  const card = "rounded-2xl border border-border bg-background p-6 shadow-[var(--shadow)]";
  return (
    <div className="space-y-16">
      <section className="overflow-hidden rounded-3xl bg-navy px-6 py-14 text-white sm:px-12 sm:py-16">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-brand">AMLR 2027 Guide</p>
        <h1 className="max-w-3xl text-4xl leading-tight text-white sm:text-5xl">
          New EU anti-money-laundering rules apply to your firm from <span className="text-brand">10 July 2027</span>
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-white/75">
          The EU AML Regulation (Regulation (EU) 2024/1624, &ldquo;AMLR&rdquo;) replaces most national AML laws with one rulebook for all 27 member states.
          Accountants, estate agents, lawyers, dealers and other non-financial firms must meet the same core rules as banks.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-6">
          <p><span className="font-[family-name:var(--font-heading)] text-5xl font-extrabold text-brand">{days}</span> <span className="text-white/70">days to go</span></p>
          <Link href="/contact?topic=demo" className="rounded-full bg-brand px-6 py-3 font-semibold text-brand-ink hover:brightness-105">Book a demo</Link>
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="text-3xl">What is changing</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div className={card}><h3 className="text-lg">One EU rulebook</h3><p className="mt-1 text-sm text-muted">AMLR is a regulation, so it applies directly in every member state. National laws can only add to it where AMLR allows, for example a lower cash limit.</p></div>
          <div className={card}><h3 className="text-lg">National supervisors stay</h3><p className="mt-1 text-sm text-muted">A companion directive (AMLD6, Directive (EU) 2024/1640) sets up national supervisors, FIUs and beneficial ownership registers. Who checks you still depends on your country and profession.</p></div>
          <div className={card}><h3 className="text-lg">Detailed EU standards</h3><p className="mt-1 text-sm text-muted">The new EU AML Authority (AMLA) is writing technical standards that spell out exactly what to collect about clients. Existing client files will need to meet them too.</p></div>
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="text-3xl">Is your firm covered?</h2>
        <p className="max-w-3xl text-muted">These non-financial businesses are &ldquo;obliged entities&rdquo; under AMLR. Banks, payment and crypto firms are covered too, but this guide is for everyone else.</p>
        <div className="overflow-hidden rounded-2xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface"><tr><th className="px-4 py-3">Who</th><th className="px-4 py-3">When the rules apply</th></tr></thead>
            <tbody>
              {WHO.map(([who, when]) => (
                <tr key={who} className="border-t border-border align-top"><td className="px-4 py-3 font-medium">{who}</td><td className="px-4 py-3 text-muted">{when}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-muted">Your country may add other businesses or exempt some. If you are unsure, <Link href="/contact?topic=other" className="underline">ask us</Link>.</p>
      </section>

      <section className="space-y-6">
        <h2 className="text-3xl">What you will have to do</h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {DUTIES.map(([title, text]) => (
            <li key={title} className={card}><h3 className="text-lg">{title}</h3><p className="mt-1 text-sm text-muted">{text}</p></li>
          ))}
        </ul>
      </section>

      <section className="grid gap-8 rounded-3xl bg-surface p-8 sm:p-12 lg:grid-cols-2">
        <div>
          <h2 className="text-3xl">Your 8-step readiness checklist</h2>
          <p className="mt-3 text-muted">Getting ready takes months, not weeks. Starting in spring 2027 leaves little room.</p>
        </div>
        <ol className="space-y-3">
          {STEPS.map((s, i) => (
            <li key={s} className="flex gap-3"><CheckCircle2 aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-accent" /><span><span className="sr-only">Step {i + 1}: </span>{s}</span></li>
          ))}
        </ol>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-3xl bg-navy p-8 text-white">
          <h2 className="text-2xl text-white">Do it yourself, with software</h2>
          <p className="mt-2 text-white/75">AMLSync App takes you through every duty above: risk assessment, client checks, ownership, screening, reporting and a file ready for your supervisor.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/signup" className="rounded-full bg-brand px-5 py-2.5 font-semibold text-brand-ink hover:brightness-105">Start free trial</Link>
            <Link href="/product" className="rounded-full border-2 border-white/35 px-5 py-2.5 font-semibold text-white hover:border-white">See the app</Link>
          </div>
        </div>
        <div className="rounded-3xl border border-border p-8">
          <h2 className="text-2xl">Or let us help</h2>
          <p className="mt-2 text-muted">AMLSync&apos;s compliance consultants can run a gap analysis, write your policies, review your existing client files or act as your outsourced compliance team.</p>
          <a href="https://amlsync.com" className="mt-6 inline-block rounded-full border-2 border-border px-5 py-2.5 font-semibold hover:border-accent">AMLSync consulting</a>
        </div>
      </section>

      <p className="text-xs text-muted">
        Sources: Regulation (EU) 2024/1624 (AMLR); Directive (EU) 2024/1640 (AMLD6). Some details depend on AMLA standards that are not final yet and on your national law.
        This guide is general information, not legal advice. Last reviewed November 2026.
      </p>
    </div>
  );
}
