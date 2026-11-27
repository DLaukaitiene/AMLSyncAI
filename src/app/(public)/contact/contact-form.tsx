"use client";

import { ActionForm, Field, Honeypot, Submit } from "@/components/form";
import { CONTACT_EMAIL } from "@/lib/billing/plans";
import { sendContact } from "./actions";
import { CONTACT_TOPICS } from "./topics";

const box = "w-full rounded border border-border bg-transparent px-3 py-2 text-sm focus:outline-2 focus:outline-accent";

export function ContactForm({ topic }: { topic: string }) {
  return (
    <ActionForm
      action={sendContact}
      render={(state) =>
        state?.message === "sent" ? (
          <p role="status" className="rounded-xl bg-brand/15 p-4 text-sm">
            <strong>Thank you, your message has been sent.</strong> We reply within 1–2 business days. For a demo, we&apos;ll suggest a time.
          </p>
        ) : null
      }
    >
      <Honeypot />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" name="name" required autoComplete="name" />
        <Field label="Company" name="company" required autoComplete="organization" />
      </div>
      <Field label="Work email" name="email" type="email" required autoComplete="email" inputMode="email" />
      <div className="space-y-1">
        <label htmlFor="need" className="block text-sm font-medium">What can we help with?</label>
        <select id="need" name="need" defaultValue={topic} className={box}>
          {CONTACT_TOPICS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <div className="space-y-1">
        <label htmlFor="message" className="block text-sm font-medium">Message</label>
        <textarea id="message" name="message" rows={5} maxLength={4000} className={box} placeholder="E.g. your sector, country, number of clients a year, and good times for a call" />
      </div>
      <Submit>Send message</Submit>
      <p className="text-xs text-muted">
        We use your details only to reply. Please don&apos;t include your clients&apos; personal data. You can also email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="underline">{CONTACT_EMAIL}</a>.
      </p>
    </ActionForm>
  );
}
