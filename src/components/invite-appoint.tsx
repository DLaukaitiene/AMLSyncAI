"use client";

import { ActionForm, Submit, type ActionState } from "@/components/form";

/** "Not on the app yet? Invite and appoint": name + email, sends the invitation and records the appointment. */
export function InviteAppoint({ action, label, withReason = false }: { action: (s: ActionState, fd: FormData) => Promise<ActionState>; label: string; withReason?: boolean }) {
  return (
    <details className="text-sm" data-testid="invite-appoint">
      <summary className="cursor-pointer text-accent underline">Not on the app yet? Invite and appoint</summary>
      <ActionForm action={action} className="mt-2 flex flex-wrap items-end gap-2 rounded-xl border border-border bg-surface p-2 [&>[role=alert]]:order-last [&>[role=alert]]:basis-full [&>[role=status]]:order-last [&>[role=status]]:basis-full">
        <label className="min-w-40 flex-1 space-y-1">
          <span className="block text-xs font-medium">Name</span>
          <input name="name" autoComplete="off" className="w-full rounded border border-border bg-background px-2 py-1.5" aria-label={`${label}: name`} />
        </label>
        <label className="min-w-48 flex-1 space-y-1">
          <span className="block text-xs font-medium">Work email</span>
          <input name="email" type="email" autoComplete="off" className="w-full rounded border border-border bg-background px-2 py-1.5" aria-label={`${label}: email`} />
        </label>
        {withReason && (
          <label className="min-w-48 flex-1 space-y-1">
            <span className="block text-xs font-medium">Reason for the change</span>
            <input name="reason" autoComplete="off" className="w-full rounded border border-border bg-background px-2 py-1.5" />
          </label>
        )}
        <Submit variant="secondary">Invite and appoint</Submit>
        <p className="basis-full text-xs text-muted">They get an email to set up their sign-in. They&apos;re appointed from today; the appointment is linked to them when they accept.</p>
      </ActionForm>
    </details>
  );
}
