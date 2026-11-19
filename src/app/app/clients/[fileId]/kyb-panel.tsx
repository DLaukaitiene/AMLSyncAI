"use client";

import { useActionState } from "react";
import { CountryField, type ActionState } from "@/components/form";
import { ActionButton } from "@/components/action-button";
import { kybRetrieveAction, kybSearchAction } from "../actions";

type Candidate = { id: string; name: string; registrationNumber: string | null; status: string | null; type: string | null; address: string | null };

/** Choose the level, search the register on that level's tier, then retrieve the right company (paid). */
export function KybSearch({ fileId, name, registrationNumber, country, litePrice, fullPrice, ownersRecorded }: { fileId: string; name: string; registrationNumber: string; country: string; litePrice: string; fullPrice: string; ownersRecorded: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(kybSearchAction.bind(null, fileId), null);
  const candidates = ((state?.data as { candidates?: Candidate[] } | undefined)?.candidates ?? []);
  const searchedLevel = ((state?.data as { level?: "lite" | "full" } | undefined)?.level ?? "full");
  const cls = "w-full rounded border border-border bg-transparent px-3 py-2 text-sm";
  return (
    <div className="space-y-3 rounded-xl border border-border p-3" data-testid="kyb-search">
      <p className="text-sm font-medium">Check the company register (Didit)</p>
      <p className="text-xs text-muted">
        Searching is free. You pay only when you retrieve the company, and only for what the register delivers: if it has no ownership data, a full ownership check is charged as company and status.
      </p>
      <form action={action} className="grid gap-3 sm:grid-cols-3">
        <fieldset className="space-y-2 sm:col-span-3">
          <legend className="text-sm font-medium">What do you need?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex gap-2 rounded-lg border border-border p-2 text-sm">
              <input type="radio" name="level" value="lite" defaultChecked={ownersRecorded} className="mt-1" />
              <span><span className="block font-semibold">Company and status ({litePrice})</span><span className="block text-xs text-muted">Registration details, status, legal form, address and officers.{ownersRecorded ? " Enough here: the ownership structure is already recorded." : ""}</span></span>
            </label>
            <label className="flex gap-2 rounded-lg border border-border p-2 text-sm">
              <input type="radio" name="level" value="full" defaultChecked={!ownersRecorded} className="mt-1" />
              <span><span className="block font-semibold">Full ownership ({fullPrice})</span><span className="block text-xs text-muted">Also the shareholders and beneficial owners through the ownership chain.</span></span>
            </label>
          </div>
        </fieldset>
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
              <span className="flex flex-wrap gap-2">
                {searchedLevel === "lite"
                  ? <ActionButton action={kybRetrieveAction.bind(null, fileId, c.id, "lite")} variant="primary">{`Company and status (${litePrice})`}</ActionButton>
                  : <ActionButton action={kybRetrieveAction.bind(null, fileId, c.id, "full")} variant="primary">{`Full ownership (${fullPrice})`}</ActionButton>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
