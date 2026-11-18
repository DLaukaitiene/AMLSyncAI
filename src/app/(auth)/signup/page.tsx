import { CONTACT_EMAIL, PLANS, SELF_SERVE_PLANS, TRIAL_DAYS } from "@/lib/billing/plans";
import Link from "next/link";
import type { Metadata } from "next";
import { PowChallenge } from "@/components/pow-challenge";
import { ActionForm, CountryField, Field, Honeypot, SelectWithOther, Submit } from "@/components/form";
import { SECTORS, signupMode } from "@/lib/server/auth/flows";
import { signupAction } from "../actions";

export const metadata: Metadata = { title: "Sign up · AMLSync App" };


export default async function SignupPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const wanted = (await searchParams).plan;
  const defaultPlan = wanted === "solo" || wanted === "starter" ? wanted : "starter";
  const invite = signupMode() === "invite";
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Create your firm&apos;s account</h1>
        <p className="text-sm text-muted">Use your company email address. Free and temporary email addresses are not accepted.</p>
      </div>
      <ActionForm action={signupAction}>
        <Honeypot />
        <PowChallenge purpose="signup" />
        {invite && <Field label="Invitation code" name="signupCode" required hint="AMLSync App is currently invitation only. Enter the invitation code exactly as you received it. No code? Write to contact@amlsync.com." autoComplete="off" />}
        <Field label="Company name" name="companyName" required autoComplete="organization" />
        <CountryField label="Country where your firm is established" name="memberState" required euFirst hint="EU countries are listed first. AMLSync App applies the EU anti-money-laundering rules (AMLR); outside the EU, check your local rules too." />
        <SelectWithOther label="Sector" name="sector" required placeholder="Choose…" options={SECTORS} otherLabel="Other (describe your activity)" />
        <Field label="Plan" name="plan" required hint={`${TRIAL_DAYS}-day free trial, then billed monthly by invoice. For more users or an API: ${CONTACT_EMAIL}.`}>
          <select name="plan" defaultValue={defaultPlan} className="w-full rounded border border-border bg-background px-3 py-2 text-sm" aria-label="Plan">
            {SELF_SERVE_PLANS.map((id) => (
              <option key={id} value={id}>{PLANS[id].name}: €{(PLANS[id].monthlyCents! / 100).toFixed(0)} per month, up to {PLANS[id].users} users</option>
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
