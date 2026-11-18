"use client";

import { useActionState } from "react";
import { CountryField, type ActionState } from "@/components/form";
import { ActionButton } from "@/components/action-button";
import { kybRetrieveAction, kybSearchAction } from "../actions";

type Candidate = { id: string; name: string; registrationNumber: string | null; status: string | null; type: string | null; address: string | null };

/** Search the company register (free), then retrieve the right company (paid). */
export function KybSearch({ fileId, name, registrationNumber, country, price }: { fileId: string; name: string; registrationNumber: string; country: string; price: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(kybSearchAction.bind(null, fileId), null);
  const candidates = ((state?.data as { candidates?: Candidate[] } | undefined)?.candidates ?? []);
  const cls = "w-full rounded border border-border bg-transparent px-3 py-2 text-sm";
  return (
    <div className="space-y-3 rounded-xl border border-border p-3" data-testid="kyb-search">
      <p className="text-sm font-medium">Check the company register (Didit)</p>
      <p className="text-xs text-muted">Searching is free. Retrieving the company with its officers, shareholders and beneficial owners costs {price}.</p>
      <form action={action} className="grid gap-3 sm:grid-cols-3">
        <CountryField label="Country of registration" name="country" defaultValue={country} />
        <label className="space-y-1 text-sm"><span className="block font-medium">Company name</span><input name="name" defaultValue={name} className={cls} /></label>
        <label className="space-y-1 text-sm"><span className="block font-medium">Registration number</span><input name="registrationNumber" defaultValue={registrationNumber} className={cls} /></label>
        <div className="sm:col-span-3">
          <button type="submit" disabled={pending} className="rounded-full border border-border px-4 py-2 text-sm font-semibold hover:border-accent disabled:opacity-60">{pending ? "Searching…" : "Search register"}</button>
        </div>
      </form>
      {state?.error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{state.error}</p>}
      {state?.message && <p role="status" className="text-sm">{state.message}</p>}
      {candidates.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border text-sm">
          {candidates.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span>
                <span className="font-medium">{c.name}</span>
                <span className="text-muted"> · {[c.registrationNumber, c.type, c.status, c.address].filter(Boolean).join(" · ")}</span>
              </span>
              <ActionButton action={kybRetrieveAction.bind(null, fileId, c.id)} variant="primary">{`Use this company (${price})`}</ActionButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
