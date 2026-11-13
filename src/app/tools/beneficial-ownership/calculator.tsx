"use client";

import { useMemo, useState } from "react";
import {
  calculateBeneficialOwnership,
  type ControlRecord,
  type OwnershipLink,
  type OwnershipParty,
  type PartyKind,
} from "@/lib/rules/beneficial-ownership";
import { assessSanctionsOwnership } from "@/lib/rules/sanctions-ownership";

interface Row {
  key: number;
  owner: string;
  ownerKind: PartyKind;
  owned: string;
  pct: string;
}

const CLIENT = "Client Ltd";

// The spec's §11.6 calculation test, so the page opens on a known answer.
const EXAMPLE: Row[] = [
  { key: 1, owner: "A", ownerKind: "natural", owned: "X Holding", pct: "60" },
  { key: 2, owner: "X Holding", ownerKind: "legal", owned: CLIENT, pct: "50" },
  { key: 3, owner: "A", ownerKind: "natural", owned: CLIENT, pct: "10" },
  { key: 4, owner: "B", ownerKind: "natural", owned: "X Holding", pct: "40" },
  { key: 5, owner: "C", ownerKind: "natural", owned: CLIENT, pct: "40" },
];

export function BoCalculator() {
  const [rows, setRows] = useState<Row[]>(EXAMPLE);
  const [sanctioned, setSanctioned] = useState("");
  const [controller, setController] = useState("");

  const result = useMemo(() => {
    try {
      const names = new Map<string, PartyKind>([[CLIENT, "legal"]]);
      for (const r of rows) {
        if (!r.owner.trim() || !r.owned.trim()) continue;
        names.set(r.owner.trim(), r.ownerKind);
        if (!names.has(r.owned.trim())) names.set(r.owned.trim(), "legal");
      }
      const control: ControlRecord[] = controller.trim()
        ? [{ personId: controller.trim(), entityId: CLIENT, type: "other", description: "Recorded control by other means" }]
        : [];
      if (controller.trim() && !names.has(controller.trim())) names.set(controller.trim(), "natural");

      const parties: OwnershipParty[] = [...names].map(([id, kind]) => ({ id, kind, name: id }));
      const links: OwnershipLink[] = rows
        .filter((r) => r.owner.trim() && r.owned.trim() && r.pct !== "")
        .map((r) => ({ ownerId: r.owner.trim(), ownedId: r.owned.trim(), pct: Number(r.pct) }));

      const bo = calculateBeneficialOwnership(CLIENT, parties, links, control);
      const listed = new Set(sanctioned.split(",").map((s) => s.trim()).filter(Boolean));
      const sanctions = assessSanctionsOwnership(CLIENT, parties, links, listed, control);
      return { bo, sanctions, error: null as string | null };
    } catch (e) {
      return { bo: null, sanctions: null, error: (e as Error).message };
    }
  }, [rows, sanctioned, controller]);

  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted">
            <tr>
              <th className="py-1 pr-2 font-normal">Owner</th>
              <th className="py-1 pr-2 font-normal">Owner type</th>
              <th className="py-1 pr-2 font-normal">Owns</th>
              <th className="py-1 pr-2 font-normal">%</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="py-1 pr-2">
                  <input aria-label="Owner" className="w-full rounded border border-border bg-transparent px-2 py-1" value={r.owner} onChange={(e) => update(r.key, { owner: e.target.value })} />
                </td>
                <td className="py-1 pr-2">
                  <select aria-label="Owner type" className="rounded border border-border bg-background px-2 py-1" value={r.ownerKind} onChange={(e) => update(r.key, { ownerKind: e.target.value as PartyKind })}>
                    <option value="natural">Person</option>
                    <option value="legal">Company</option>
                    <option value="arrangement">Trust / arrangement</option>
                  </select>
                </td>
                <td className="py-1 pr-2">
                  <input aria-label="Owns" className="w-full rounded border border-border bg-transparent px-2 py-1" value={r.owned} onChange={(e) => update(r.key, { owned: e.target.value })} />
                </td>
                <td className="py-1 pr-2">
                  <input aria-label="Percentage" type="number" min={0} max={100} step="0.01" className="w-24 rounded border border-border bg-transparent px-2 py-1" value={r.pct} onChange={(e) => update(r.key, { pct: e.target.value })} />
                </td>
                <td className="py-1">
                  <button type="button" className="text-muted hover:text-foreground" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label="Remove row">
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          type="button"
          className="mt-2 rounded border border-border px-3 py-1 text-sm"
          onClick={() => setRows((rs) => [...rs, { key: Date.now(), owner: "", ownerKind: "natural", owned: CLIENT, pct: "" }])}
        >
          Add ownership link
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 text-sm">
        <label className="space-y-1">
          <span className="block text-muted">Person with control by other means (optional)</span>
          <input className="w-full rounded border border-border bg-transparent px-2 py-1" value={controller} onChange={(e) => setController(e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="block text-muted">Sanctioned parties (comma-separated)</span>
          <input className="w-full rounded border border-border bg-transparent px-2 py-1" value={sanctioned} onChange={(e) => setSanctioned(e.target.value)} />
        </label>
      </div>

      {result.error && <p className="text-sm text-red-600" role="alert">{result.error}</p>}

      {result.bo && (
        <section className="space-y-2" aria-live="polite">
          <h2 className="font-semibold">Result for {CLIENT}</h2>
          <ul className="divide-y divide-border rounded-md border border-border text-sm">
            {result.bo.candidates.map((c) => (
              <li key={c.personId} className="px-4 py-2">
                <div className="flex justify-between">
                  <span className="font-medium">{c.name}</span>
                  <span>
                    {c.effectivePct}% {c.isBeneficialOwner ? <strong className="text-accent">· Beneficial owner</strong> : <span className="text-muted">· below threshold</span>}
                  </span>
                </div>
                <div className="text-muted">
                  {c.chains.map((ch) => `${ch.path.join(" → ")} = ${ch.pct}%`).join("; ")}
                </div>
                {c.reasons.map((r) => (
                  <div key={r} className="text-muted">{r}</div>
                ))}
              </li>
            ))}
          </ul>
          {result.bo.requiresSmoFallback && (
            <p className="text-sm">No beneficial owner found: identify all senior managing officials and record the steps taken (AMLR Art. 22(2)).</p>
          )}
          {result.bo.unresolvedOwners.length > 0 && (
            <p className="text-sm">Unresolved corporate owners (look these up next): {result.bo.unresolvedOwners.join(", ")}</p>
          )}
          {result.bo.overAllocated.map((o) => (
            <p key={o.entityId} className="text-sm text-red-600">Ownership of {o.entityId} adds up to {o.totalPct}%: check the data.</p>
          ))}
          {result.sanctions && (
            <p className="text-sm">
              Sanctioned ownership: {result.sanctions.sanctionedOwnershipPct}%{" "}
              {result.sanctions.affected ? <strong className="text-red-600">· {result.sanctions.reasons.join("; ")}</strong> : <span className="text-muted">· not sanctions-affected</span>}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
