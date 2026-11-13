import Link from "next/link";
import type { Metadata } from "next";
import { ActionForm, Field, Honeypot, Submit } from "@/components/form";
import { EU_MEMBER_STATES, SECTORS, signupMode } from "@/lib/server/auth/flows";
import { signupAction } from "../actions";

export const metadata: Metadata = { title: "Sign up · AMLSyncAI" };

const NAMES = new Intl.DisplayNames(["en"], { type: "region" });

export default function SignupPage() {
  const invite = signupMode() === "invite";
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Create your firm&apos;s account</h1>
        <p className="text-sm text-muted">Use your company email address. Free and temporary email addresses are not accepted.</p>
      </div>
      <ActionForm action={signupAction}>
        <Honeypot />
        {invite && <Field label="Sign-up code" name="signupCode" required hint="AMLSyncAI is currently invitation only. Your code is in your invitation email." autoComplete="off" />}
        <Field label="Company name" name="companyName" required autoComplete="organization" />
        <Field label="Member state" name="memberState" required>
          <select name="memberState" defaultValue="" className="w-full rounded border border-border bg-background px-3 py-2 text-sm" aria-label="Member state">
            <option value="" disabled>Choose…</option>
            {[...EU_MEMBER_STATES].sort((a, b) => NAMES.of(a)!.localeCompare(NAMES.of(b)!)).map((c) => (
              <option key={c} value={c}>{NAMES.of(c)}</option>
            ))}
          </select>
        </Field>
        <Field label="Sector" name="sector" required>
          <select name="sector" defaultValue="" className="w-full rounded border border-border bg-background px-3 py-2 text-sm" aria-label="Sector">
            <option value="" disabled>Choose…</option>
            {SECTORS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </Field>
        <Field label="Your name" name="name" required autoComplete="name" />
        <Field label="Company email" name="email" type="email" required autoComplete="email" />
        <Field label="Password" name="password" type="password" required autoComplete="new-password" hint="At least 12 characters. We check it against known breached passwords." />
        <Submit>Create account</Submit>
      </ActionForm>
      <p className="text-sm text-muted">
        Already have an account? <Link href="/login" className="text-accent underline">Sign in</Link>. Joining a colleague&apos;s firm? Ask them to invite you.
      </p>
    </div>
  );
}
