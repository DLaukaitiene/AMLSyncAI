"use client";

import { ActionForm, Field, Submit, type ActionState } from "./form";

/** "Something feels off" — available to every user on client and matter pages (spec §4.6). */
export function RaiseSuspicion({ action }: { action: (prev: ActionState, fd: FormData) => Promise<ActionState> }) {
  return (
    <details className="rounded-md border border-border p-4">
      <summary className="cursor-pointer text-sm font-medium">Report a suspicion to the Compliance Officer</summary>
      <ActionForm action={action} className="mt-3 space-y-3">
        <p className="text-xs text-muted">
          Only the Compliance Officer will see this report. Never tell the client or anyone involved (AMLR Art. 73).
        </p>
        <Field label="What happened?" name="summary" required />
        <Field label="Why does it seem suspicious?" name="details" required />
        <Field label="Amount involved (EUR)" name="amountEUR" type="number" />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="attempted" /> The transaction was attempted but did not go ahead</label>
        <Submit variant="secondary">Send report</Submit>
      </ActionForm>
    </details>
  );
}
