"use client";

import { ActionForm, Submit, type ActionState } from "@/components/form";
import { Help } from "@/components/help";

/** Appoint the Compliance Officer / responsible manager straight from the dashboard box. */
export function AppointInline({ staff, action, label, current, help }: { staff: { id: string; name: string }[]; action: (s: ActionState, fd: FormData) => Promise<ActionState>; label: string; current: string | null; help?: React.ReactNode }) {
  return (
    <ActionForm action={action} className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-surface p-2 text-sm [&>[role=alert]]:order-last [&>[role=alert]]:basis-full [&>[role=status]]:order-last [&>[role=status]]:basis-full">
      <label className="min-w-0 flex-1 space-y-1">
        <span className="flex items-center gap-1 text-xs font-medium">{label}{help ? <Help label={`What is the ${label}?`}>{help}</Help> : null}</span>
        <select name="userId" defaultValue="" className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm" aria-label={label}>
          <option value="" disabled>{current ? `${current} (change…)` : "Choose a person…"}</option>
          {staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </label>
      <input type="hidden" name="reason" value="Appointed from the dashboard" />
      <Submit variant="secondary">Appoint</Submit>
    </ActionForm>
  );
}
