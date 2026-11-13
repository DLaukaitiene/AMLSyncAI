"use client";

import Link from "next/link";
import { ActionForm, Field, Submit, type ActionState } from "@/components/form";
import { enrollTotpAction } from "../../actions";

export function EnrollForm() {
  return (
    <ActionForm
      action={enrollTotpAction}
      render={(state: ActionState) => {
        const codes = (state?.data as { recoveryCodes?: string[] } | undefined)?.recoveryCodes;
        if (!codes) {
          return (
            <>
              <Field label="6-digit code" name="code" inputMode="numeric" autoComplete="one-time-code" required />
              <Submit>Turn on two-factor authentication</Submit>
            </>
          );
        }
        return (
          <div className="space-y-3">
            <h2 className="font-semibold">Save your recovery codes</h2>
            <p className="text-sm text-muted">
              Each code works once if you lose your phone. Store them somewhere safe, such as a password manager. They won&apos;t be shown again.
            </p>
            <ul className="grid grid-cols-2 gap-1 rounded border border-border p-3 font-mono text-sm" data-testid="recovery-codes">
              {codes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <Link href="/app" className="inline-block rounded bg-accent px-4 py-2 text-sm font-medium text-white dark:text-black">
              I&apos;ve saved them, continue
            </Link>
          </div>
        );
      }}
    />
  );
}
