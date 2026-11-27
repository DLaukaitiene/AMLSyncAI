import Link from "next/link";
import type { Metadata } from "next";
import {
  AlertTriangle, BookOpenCheck, Building2, CalendarClock, FileArchive, Fingerprint, Globe2, Lock, Network, Send, ShieldCheck, Users,
} from "lucide-react";
import { TRIAL_DAYS } from "@/lib/billing/plans";

export const metadata: Metadata = {
  title: "AMLSync App · AML software for EU obliged entities",
  description: "Client onboarding, identity checks, beneficial owners, sanctions and PEP screening, risk scoring, suspicion reporting and a supervisor-ready file, built on the EU AML Regulation.",
};

const MODULES = [
  { icon: Send, title: "Client portal", text: "Send one secure link. Your client fills in the questionnaire, uploads documents, verifies their identity and signs. Reminders go out automatically." },
  { icon: Fingerprint, title: "Identity checks", text: "National eID or ID document with chip read, liveness and face match. The images and report are saved to the client file." },
  { icon: Network, title: "Ownership and beneficial owners", text: "Draw the structure once, through holdings and trusts. The app finds everyone with 25% or more or other control, and checks it against the company register." },
  { icon: ShieldCheck, title: "Sanctions and PEP screening", text: "Everyone in the structure is screened against EU and UN lists, and re-checked every day when the lists change." },
  { icon: AlertTriangle, title: "Risk scoring and approvals", text: "A clear, explainable risk score. High-risk and PEP clients go to enhanced checks and need a manager's approval before you accept them." },
  { icon: Building2, title: "Matters and transactions", text: "Property deals, sales and other matters with all their parties. Red-flag rules catch cash, split payments and unusual payers." },
  { icon: BookOpenCheck, title: "Suspicion reporting", text: "Staff raise concerns; the compliance officer decides and drafts the report for the FIU. Requests from the FIU are tracked against the deadline." },
  { icon: CalendarClock, title: "Firm compliance", text: "Firm risk assessment, AML policies, governance, staff training and integrity checks, with a calendar so nothing is missed." },
  { icon: FileArchive, title: "Supervisor file", text: "Every decision is recorded. Export a complete client or firm file as PDF in one click when the supervisor asks." },
];

const SECTORS = [
  ["Accountants and tax advisors", "Recurring clients, company owners and regular refreshes."],
  ["Real estate agents", "Buyer and seller checks, source of funds and cash."],
  ["Lawyers and notaries", "Property and company work, client money and privilege."],
  ["Company service providers", "Formations, nominees and trusts."],
  ["High-value goods traders", "Customer and supplier checks, cash limits and threshold reports."],
  ["Football clubs and agents", "Transfers, investors and sponsors, ready before the rules start in 2029."],
];

export default function Product() {
  const card = "rounded-2xl border border-border bg-background p-6 shadow-[var(--shadow)]";
  return (
    <div className="space-y-16">
      <section className="overflow-hidden rounded-3xl bg-navy px-6 py-14 text-white sm:px-12 sm:py-16">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-brand">AMLSync App</p>
        <h1 className="max-w-3xl text-4xl leading-tight text-white sm:text-5xl">
          Every AML duty, from first contact to <span className="text-brand">supervisor visit</span>
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-white/75">
          Built on the EU AML Regulation for small and mid-sized firms without a compliance team. Your national rules are added in your firm&apos;s Country Profile.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/signup" className="rounded-full bg-brand px-6 py-3 font-semibold text-brand-ink hover:brightness-105">Start {TRIAL_DAYS}-day free trial</Link>
          <Link href="/contact?topic=demo" className="rounded-full border-2 border-white/35 px-6 py-3 font-semibold text-white hover:border-white">Book a demo</Link>
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="text-3xl">What&apos;s inside</h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map(({ icon: Icon, title, text }) => (
            <li key={title} className={card}>
              <span className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand/15 text-accent"><Icon aria-hidden className="h-5 w-5" /></span>
              <h3 className="text-lg">{title}</h3>
              <p className="mt-1 text-sm text-muted">{text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-6">
        <h2 className="text-3xl">Made for your sector</h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SECTORS.map(([title, text]) => (
            <li key={title} className="rounded-2xl bg-surface p-6"><h3 className="text-lg">{title}</h3><p className="mt-1 text-sm text-muted">{text}</p></li>
          ))}
        </ul>
      </section>

      <section className="grid gap-6 rounded-3xl bg-surface p-8 sm:grid-cols-3 sm:p-12">
        {[
          { icon: Globe2, title: "All 27 EU countries", text: "EU rules built in, plus your country's supervisor, FIU, cash limit and other options." },
          { icon: Lock, title: "Data stays in the EU", text: "Two-factor sign-in for everyone, encrypted storage and a full audit trail." },
          { icon: Users, title: "Help when you need it", text: "AMLSync's own compliance consultants are a message away." },
        ].map(({ icon: Icon, title, text }) => (
          <div key={title}>
            <Icon aria-hidden className="h-6 w-6 text-accent" />
            <h3 className="mt-2 text-lg">{title}</h3>
            <p className="text-sm text-muted">{text}</p>
          </div>
        ))}
      </section>

      <section className="flex flex-col items-start gap-4 rounded-3xl bg-navy p-8 text-white sm:flex-row sm:items-center sm:justify-between sm:p-12">
        <div>
          <h2 className="text-2xl text-white">Ready before 10 July 2027</h2>
          <p className="mt-1 text-white/70">Try it free for {TRIAL_DAYS} days, no card needed. <Link href="/security" className="underline">How we protect your data</Link></p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/signup" className="rounded-full bg-brand px-6 py-3 font-semibold text-brand-ink hover:brightness-105">Start free trial</Link>
          <Link href="/pricing" className="rounded-full border-2 border-white/35 px-6 py-3 font-semibold text-white hover:border-white">See pricing</Link>
        </div>
      </section>
    </div>
  );
}
