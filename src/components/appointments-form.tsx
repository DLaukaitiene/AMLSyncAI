"use client";

import { useState } from "react";
import { ActionForm, Submit, type ActionState } from "@/components/form";

type Person = { id: string; name: string };

/** Change the Compliance Manager and Compliance Officer; "Same person" (small firms) shows one choice for both. */
export function AppointmentsForm({ action, users, managerId, officerId }: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  users: Person[]; managerId: string | null; officerId: string | null;
}) {
  const [same, setSame] = useState(!!managerId && managerId === officerId);
  const select = (name: string, label: string, value: string | null) => (
    <label className="min-w-48 flex-1 space-y-1">
      <span className="block text-xs font-medium">{label}</span>
      <select name={name} defaultValue={value ?? ""} className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm" aria-label={label}>
        <option value="" disabled>Choose a person…</option>
        {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
      </select>
    </label>
  );
  return (
    <ActionForm action={action} className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-3 text-sm [&>[role=alert]]:order-last [&>[role=alert]]:basis-full [&>[role=status]]:order-last [&>[role=status]]:basis-full">
      <label className="flex basis-full items-center gap-2">
        <input type="checkbox" role="switch" name="same" checked={same} onChange={(e) => setSame(e.target.checked)} className="h-4 w-4" />
        <span><strong>Same person</strong> holds both roles <span className="text-muted">(allowed for small firms)</span></span>
      </label>
      {same ? select("manager", "Compliance Manager & Compliance Officer", managerId) : <>{select("manager", "Compliance Manager", managerId)}{select("officer", "Compliance Officer", officerId)}</>}
      <label className="min-w-48 flex-1 space-y-1">
        <span className="block text-xs font-medium">Reason for the change</span>
        <input name="reason" autoComplete="off" className="w-full rounded border border-border bg-background px-2 py-1.5" />
      </label>
      <Submit variant="primary">Save</Submit>
    </ActionForm>
  );
}
