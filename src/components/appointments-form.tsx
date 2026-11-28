"use client";

import { useState } from "react";
import { ActionForm, Submit, type ActionState } from "@/components/form";
import { Help } from "@/components/help";

type Person = { id: string; name: string };
type Slot = "manager" | "officer";

/**
 * Change the Compliance Manager and Compliance Officer. "Same person" (small firms) shows one choice for both.
 * Under each choice: "Not on the app yet? Invite them" swaps the list for name + email (invited and appointed on Save).
 */
export function AppointmentsForm({ action, users, managerId, officerId }: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  users: Person[]; managerId: string | null; officerId: string | null;
}) {
  const [same, setSame] = useState(!!managerId && managerId === officerId);
  const [invite, setInvite] = useState<Record<Slot, boolean>>({ manager: false, officer: false });
  const input = "w-full rounded border border-border bg-background px-2 py-1.5 text-sm";
  const column = (slot: Slot, label: string, value: string | null) => (
    <div className="min-w-56 flex-1 space-y-1">
      {invite[slot] ? (
        <>
          <input type="hidden" name={`${slot}Mode`} value="invite" />
          <span className="block text-xs font-medium">{label}: invite someone new</span>
          <input name={`${slot}Name`} placeholder="Full name" autoComplete="off" className={input} aria-label={`${label}: name`} />
          <input name={`${slot}Email`} type="email" placeholder="Email" autoComplete="off" className={input} aria-label={`${label}: email`} />
          <button type="button" className="text-xs text-accent underline" onClick={() => setInvite({ ...invite, [slot]: false })}>Choose someone on the app instead</button>
        </>
      ) : (
        <>
          <label className="block space-y-1">
            <span className="block text-xs font-medium">{label}</span>
            <select name={slot} defaultValue={value ?? ""} className={input} aria-label={label}>
              <option value="" disabled>Choose a person…</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
          <button type="button" className="text-xs text-accent underline" onClick={() => setInvite({ ...invite, [slot]: true })} data-testid={`invite-${slot}`}>Not on the app yet? Invite them</button>
        </>
      )}
    </div>
  );
  return (
    <ActionForm action={action} className="flex flex-wrap items-start gap-3 rounded-xl border border-border bg-surface p-3 text-sm [&>[role=alert]]:order-last [&>[role=alert]]:basis-full [&>[role=status]]:order-last [&>[role=status]]:basis-full">
      <div className="flex basis-full flex-wrap items-center gap-1.5">
        <label className="flex items-center gap-2">
          <input type="checkbox" role="switch" name="same" checked={same} onChange={(e) => setSame(e.target.checked)} className="h-4 w-4" />
          <span><strong>Same person</strong> holds both roles <span className="text-muted">(allowed for small firms)</span></span>
        </label>
        <Help label="What is a small firm?">
          <p>The AML rules set no fixed number. One person may be both Compliance Manager and Compliance Officer when the firm&apos;s size and the nature of its business justify it.</p>
          <p>That usually means a sole practitioner or a firm with only a few staff, a simple business, no branches and mostly lower-risk clients.</p>
          <p>As the firm grows or takes on higher-risk work, your supervisor may expect two different people.</p>
        </Help>
      </div>
      {same ? column("manager", "Compliance Manager & Compliance Officer", managerId) : <>{column("manager", "Compliance Manager", managerId)}{column("officer", "Compliance Officer", officerId)}</>}
      <label className="min-w-48 flex-1 space-y-1">
        <span className="block text-xs font-medium">Reason for the change</span>
        <input name="reason" autoComplete="off" className={input} />
      </label>
      <div className="self-end"><Submit variant="primary">Save</Submit></div>
    </ActionForm>
  );
}
