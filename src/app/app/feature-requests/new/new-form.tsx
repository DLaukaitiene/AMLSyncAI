"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ActionForm, Field, Submit, type ActionState } from "@/components/form";
import { createRequestAction, voteAction } from "../actions";

type Similar = { id: string; title: string; status: string; votes: number };

export function NewRequestForm({ module }: { module: string }) {
  const [title, setTitle] = useState("");
  const [similar, setSimilar] = useState<Similar[]>([]);
  const [voted, setVoted] = useState<string | null>(null);
  useEffect(() => {
    if (title.trim().length < 3) return setSimilar([]);
    const t = setTimeout(async () => {
      const r = await fetch(`/api/feature-requests/similar?q=${encodeURIComponent(title)}`);
      if (r.ok) setSimilar(await r.json());
    }, 250);
    return () => clearTimeout(t);
  }, [title]);
  return (
    <ActionForm
      action={createRequestAction}
      render={(s: ActionState) =>
        (s?.data as { pii?: boolean } | undefined)?.pii ? (
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="confirmNoClientData" /> I confirm this is not client data</label>
        ) : null
      }
    >
      <p className="rounded border border-amber-400 px-3 py-2 text-sm">Don&apos;t include client personal data (names, ID numbers, IBANs, emails, phone numbers, dates of birth).</p>
      <div className="space-y-1">
        <label htmlFor="fr-title" className="block text-sm font-medium">Title *</label>
        <input id="fr-title" name="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} className="w-full rounded border border-border bg-transparent px-3 py-2 text-sm" />
      </div>
      {similar.length > 0 && (
        <div className="space-y-1 rounded border border-border p-3 text-sm" data-testid="similar">
          <p className="font-medium">Similar requests — vote instead of creating a new one?</p>
          <ul>
            {similar.map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-2">
                <Link href={`/app/feature-requests/${x.id}`} className="text-accent underline">{x.title}</Link>
                <span className="flex items-center gap-2 text-muted">
                  {x.votes} vote(s)
                  <button type="button" className="rounded border border-border px-2 py-0.5" onClick={async () => { const r = await voteAction(x.id); setVoted(r?.message ?? r?.error ?? null); }}>Vote</button>
                </span>
              </li>
            ))}
          </ul>
          {voted && <p role="status">{voted}</p>}
        </div>
      )}
      <Field label="What problem does it solve?" name="problem" required />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="How often does it happen?" name="frequency" hint="e.g. every client, weekly" />
        <Field label="How important is it?" name="importance" required>
          <select name="importance" aria-label="How important is it?" defaultValue="important" className="w-full rounded border border-border bg-background px-3 py-2 text-sm">
            <option value="nice-to-have">Nice to have</option><option value="important">Important</option><option value="blocking">Blocking</option>
          </select>
        </Field>
        <Field label="Module" name="module" defaultValue={module} />
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="regulatory" /> This is required by law in my country</label>
      <Field label="Legal reference (if required by law)" name="legalReference" />
      <Submit>Submit request</Submit>
    </ActionForm>
  );
}
