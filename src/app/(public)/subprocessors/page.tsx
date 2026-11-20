import type { Metadata } from "next";
import { SUBPROCESSORS, SUBPROCESSORS_UPDATED } from "@/lib/legal/subprocessors";
import { SELLER } from "@/lib/billing/invoice";
import { CONTACT_EMAIL } from "@/lib/billing/plans";

export const metadata: Metadata = { title: "Sub-processors and data location · AMLSync App", description: "The suppliers that process data for AMLSync App, what they do and where the data is stored." };

export default function Subprocessors() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl">Sub-processors and data location</h1>
        <p className="mt-2 max-w-3xl text-muted">
          AMLSync App is provided by {SELLER.name}. Firms using it are controllers of their clients&apos; data; {SELLER.name} acts as their processor and uses
          the suppliers below. Last updated {SUBPROCESSORS_UPDATED}. We announce changes before a new sub-processor starts processing personal data.
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left"><tr>{["Supplier", "What for", "Data", "Where", "Safeguard"].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-border">
            {SUBPROCESSORS.map((s) => (
              <tr key={s.name} className={s.active ? "" : "text-muted"}>
                <td className="px-3 py-2 font-medium">{s.name}{s.active ? "" : " (not in use)"}</td>
                <td className="px-3 py-2">{s.purpose}</td>
                <td className="px-3 py-2">{s.data}</td>
                <td className="px-3 py-2">{s.location}</td>
                <td className="px-3 py-2">{s.safeguard}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-muted">Questions about data protection: {CONTACT_EMAIL}.</p>
    </div>
  );
}
