import Link from "next/link";
import type { Metadata } from "next";
import { ActionForm, Field, Honeypot, Submit } from "@/components/form";
import { loginAction } from "../actions";

export const metadata: Metadata = { title: "Sign in · AMLSyncAI" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const { reset } = await searchParams;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      {reset && <p role="status" className="text-sm">Your password was changed. Sign in with the new password.</p>}
      <ActionForm action={loginAction}>
        <Honeypot />
        <Field label="Email" name="email" type="email" required autoComplete="username" />
        <Field label="Password" name="password" type="password" required autoComplete="current-password" />
        <Submit>Continue</Submit>
      </ActionForm>
      <p className="text-sm text-muted">
        <Link href="/forgot" className="text-accent underline">Forgot password?</Link> · New firm? <Link href="/signup" className="text-accent underline">Sign up</Link>
      </p>
    </div>
  );
}
