"use client";

import { ActionForm, Submit, type ActionState } from "@/components/form";

/** Appoint the Compliance Officer / responsible manager straight from the dashboard box. */
export function AppointInline({ staff, action, label, current }: { staff: { id: string; name: string }[]; action: (s: ActionState, fd: FormData) => Promise<ActionState>; label: string; current: string | null }) {
  return (
    <ActionForm action={action} className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-surface p-2 text-sm">
      <label className="min-w-0 flex-1 space-y-1">
        <span className="block text-xs font-medium">{label}</span>
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
