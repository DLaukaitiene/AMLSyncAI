import type { Metadata } from "next";
import { CalendarCheck, Mail, MessageSquare } from "lucide-react";
import { CONTACT_EMAIL } from "@/lib/billing/plans";
import { ContactForm } from "./contact-form";
import { CONTACT_TOPICS } from "./topics";

export const metadata: Metadata = {
  title: "Contact and demo · AMLSync App",
  description: "Book a 30-minute demo of AMLSync App or ask us anything about AMLR compliance for your firm.",
};

export default async function Contact({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const { topic } = await searchParams;
  const selected = CONTACT_TOPICS.some((t) => t.value === topic) ? topic! : "demo";
  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr]">
      <section className="space-y-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Contact</p>
        <h1 className="text-4xl leading-tight">Book a demo or ask us anything</h1>
        <p className="text-lg text-muted">
          We&apos;ll show you AMLSync App on your own kind of client, for example a company owned through a holding, in about 30 minutes.
        </p>
        <ul className="space-y-4 text-sm">
          <li className="flex gap-3"><CalendarCheck aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-accent" /><span><strong>Demo:</strong> a live walk-through of onboarding, ownership, screening and the supervisor file, with time for your questions.</span></li>
          <li className="flex gap-3"><MessageSquare aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-accent" /><span><strong>Reply within 1–2 business days.</strong> In English, Lithuanian or Russian.</span></li>
          <li className="flex gap-3"><Mail aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-accent" /><span>Prefer email? <a href={`mailto:${CONTACT_EMAIL}`} className="underline">{CONTACT_EMAIL}</a></span></li>
        </ul>
      </section>
      <section className="rounded-3xl border border-border bg-background p-6 shadow-[var(--shadow)] sm:p-8">
        <ContactForm topic={selected} />
      </section>
    </div>
  );
}
