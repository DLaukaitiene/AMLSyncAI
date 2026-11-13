import Link from "next/link";
import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { currentProfile } from "@/lib/server/country-profile";
import { decryptField } from "@/lib/server/crypto";
import { ReportBlock } from "@/components/report-block";

export default async function ReportsPage() {
  const s = await requireUser("case.view");
  const { reports, profile } = await withTenant(s.firm.id, async (tx) => ({
    reports: (await tx.report.findMany({ orderBy: { createdAt: "desc" }, take: 200 })).map((r) => ({
      ...r, ...(({ narrative, aiDrafted }) => ({ narrative, aiDrafted }))(JSON.parse(decryptField(s.firm.id, r.contentEnc)) as { narrative?: string; aiDrafted?: boolean }),
    })),
    profile: (await currentProfile(tx, s.firm.id)).profile,
  }));
  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-2xl font-semibold">Reports</h1>
      <p className="text-sm text-muted">
        Suspicious transaction reports, threshold and cash reports, register discrepancy reports and sanctions notices. Export the file and upload
        it through the channel in your Country Profile, then record the receipt.
      </p>
      {reports.length === 0 && <p className="text-sm">No reports.</p>}
      {reports.map((r) => (
        <div key={r.id} className="space-y-1">
          {(r.caseId || r.matterId) && (
            <Link className="text-xs text-accent underline" href={r.caseId ? `/app/cases/${r.caseId}` : `/app/matters/${r.matterId}`}>{r.caseId ? "Open case" : "Open matter"}</Link>
          )}
          <ReportBlock r={r} narrative={r.narrative} aiDrafted={r.aiDrafted} profile={profile} back="/app/reports" />
        </div>
      ))}
    </div>
  );
}
