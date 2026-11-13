import Link from "next/link";
import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { can } from "@/lib/auth/permissions";
import { ImportForm } from "./import-form";

type Rem = { gaps: { id: string; label: string }[]; priority?: number; risk?: string; lastCddDate?: string | null };

export default async function RemediationPage() {
  const s = await requireUser("client.view");
  const files = await withTenant(s.firm.id, (tx) =>
    tx.cddFile.findMany({ where: { source: "back-book" }, include: { party: { select: { displayName: true, kind: true } } } }),
  );
  const open = files.filter((f) => f.status === "OPEN").sort((a, b) => ((b.remediation as Rem).priority ?? 0) - ((a.remediation as Rem).priority ?? 0));
  const done = files.length - open.length;
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Back-book remediation</h1>
        <p className="max-w-3xl text-sm text-muted">
          Bring existing client files up to the new CDD standard (AMLR and the AMLA CDD RTS). Import your client list, then work from the top: high-risk
          files first, then the files with the most gaps. A file is remediated when it&apos;s accepted again with nothing open. Remediation deadline: per
          the final CDD RTS [verify].
        </p>
        {files.length > 0 && <p className="text-sm"><strong>{done}</strong> of {files.length} files remediated ({Math.round((done / files.length) * 100)}%).</p>}
      </div>
      {can(s.user.roles, "client.edit") && (
        <section className="max-w-2xl space-y-2">
          <h2 className="text-lg font-semibold">Import existing clients</h2>
          <p className="text-sm text-muted">
            CSV with a header row: <code>type,first_names,last_name,name,birth_date,nationalities,residence_country,address,registration_number,country,email,purpose,last_cdd_date,pep,documents</code>.
            type is person or company; dates YYYY-MM-DD; nationalities and documents separated by |; documents can be id, address, extract, bo, sof.
          </p>
          <ImportForm />
        </section>
      )}
      {open.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-semibold">To do ({open.length})</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted"><tr><th className="py-1 pr-3 font-normal">Client</th><th className="py-1 pr-3 font-normal">Risk</th><th className="py-1 pr-3 font-normal">Gaps</th><th className="py-1 font-normal">Last CDD</th></tr></thead>
              <tbody className="divide-y divide-border">
                {open.slice(0, 500).map((f) => {
                  const r = f.remediation as Rem;
                  return (
                    <tr key={f.id}>
                      <td className="py-1 pr-3"><Link className="text-accent underline" href={`/app/clients/${f.id}`}>{f.party.displayName}</Link></td>
                      <td className={`py-1 pr-3 ${r.risk === "High" ? "text-red-700 dark:text-red-300" : ""}`}>{r.risk ?? "—"}</td>
                      <td className="py-1 pr-3">{r.gaps.map((g) => g.label).join("; ") || "none — review and accept"}</td>
                      <td className="py-1">{r.lastCddDate ?? "unknown"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
