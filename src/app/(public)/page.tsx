import Link from "next/link";
import { ShieldCheck, Users, Globe2, FileText, CalendarClock, Fingerprint } from "lucide-react";
import { EU_CORE } from "@/lib/rules/eu-core";
import { PLANS, TRIAL_DAYS } from "@/lib/billing/plans";

const FEATURES = [
  { icon: Fingerprint, title: "Identity checks in minutes", text: "National eID or ID document with chip read, liveness and face match. Images, video and report saved to the client file." },
  { icon: Users, title: "Beneficial owners, calculated", text: "Enter the structure once; AMLSync App works out who owns or controls 25% or more, and screens everyone in it." },
  { icon: ShieldCheck, title: "Sanctions and PEP screening", text: "EU and UN lists included, re-checked automatically whenever a list changes. Ownership chains are added up for the 50% rule." },
  { icon: Globe2, title: "Your country's rules", text: "EU rules built in, plus your national details in a Country Profile — for every country where you have an office." },
  { icon: CalendarClock, title: "Nothing slips", text: "Refresh dates, reports and deadlines in one compliance calendar, with reminders to clients and staff." },
  { icon: FileText, title: "Ready for the supervisor", text: "Risk assessment, policies, training records and a complete file per client — exported in one click." },
];

export default function Home() {
  return (
    <div className="space-y-16">
      <section className="overflow-hidden rounded-3xl bg-navy px-6 py-14 text-white sm:px-12 sm:py-20">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-brand">EU AMLR · applies from {EU_CORE.applicationDate}</p>
        <h1 className="max-w-3xl text-4xl leading-tight text-white sm:text-5xl">
          Anti-money-laundering compliance, <span className="text-brand">without the paperwork</span>
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-white/75">
          For accountants, real estate agents, lawyers, high-value goods traders and every other obliged entity under Regulation (EU) 2024/1624.
          Onboard clients, check identities, screen, assess risk and keep the records your supervisor asks for.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/signup" className="rounded-full bg-brand px-6 py-3 font-semibold text-brand-ink hover:brightness-105">Start {TRIAL_DAYS}-day free trial</Link>
          <Link href="/pricing" className="rounded-full border-2 border-white/35 px-6 py-3 font-semibold text-white hover:border-white">See pricing</Link>
        </div>
        <p className="mt-4 text-sm text-white/55">From €{(PLANS.solo.monthlyCents! / 100).toFixed(0)} per month. No card needed.</p>
      </section>

      <section className="space-y-6">
        <h2 className="text-3xl">Everything AMLR asks of you, in one place</h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <li key={title} className="rounded-2xl border border-border bg-background p-6 shadow-[var(--shadow)]">
              <span className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand/15 text-accent"><Icon aria-hidden className="h-5 w-5" /></span>
              <h3 className="text-lg">{title}</h3>
              <p className="mt-1 text-sm text-muted">{text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-6 rounded-3xl bg-surface p-8 sm:grid-cols-3 sm:p-12">
        {[
          ["1", "Set up your firm", "Choose your country and sector. AMLSync App drafts your risk assessment and policies."],
          ["2", "Invite your client", "One secure link: the client fills in the questionnaire, uploads documents and verifies their identity."],
          ["3", "Decide with confidence", "Risk score, gates and the audit trail are done for you. You approve; AMLSync App keeps the record."],
        ].map(([n, title, text]) => (
          <div key={n}>
            <span className="font-[family-name:var(--font-heading)] text-3xl font-extrabold text-orange">{n}</span>
            <h3 className="mt-2 text-lg">{title}</h3>
            <p className="text-sm text-muted">{text}</p>
          </div>
        ))}
      </section>

    </div>
  );
}
