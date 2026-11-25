import { FileText } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import Link from "next/link";
import { aiForFirm } from "@/lib/server/ai";
import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { currentProfile } from "@/lib/server/country-profile";
import { decryptField } from "@/lib/server/crypto";
import { ReportBlock } from "@/components/report-block";
import { PageTitle } from "@/components/help";

export default async function ReportsPage() {
  const s = await requireUser("case.view");
  const { reports, profile, ai } = await withTenant(s.firm.id, async (tx) => ({
    ai: await aiForFirm(tx, s.firm.id),
    reports: (await tx.report.findMany({ orderBy: { createdAt: "desc" }, take: 200 })).map((r) => ({
      ...r, ...(({ narrative, aiDrafted }) => ({ narrative, aiDrafted }))(JSON.parse(decryptField(s.firm.id, r.contentEnc)) as { narrative?: string; aiDrafted?: boolean }),
    })),
    profile: (await currentProfile(tx, s.firm.id)).profile,
  }));
  return (
    <div className="max-w-4xl space-y-4">
      <PageTitle className="text-3xl" help={<>
        Suspicious transaction reports, threshold and cash reports, register discrepancy reports and sanctions notices. Export the file and upload
        it through the channel in your Country Profile, then record the receipt.
      </>}>Report Queue</PageTitle>
      {reports.length === 0 && <EmptyState icon={FileText} title="No reports" text="Suspicious transaction reports and threshold reports to your FIU appear here once a case or a payment needs one." />}
      {reports.map((r) => (
        <div key={r.id} className="space-y-1">
          {(r.caseId || r.matterId) && (
            <Link className="text-xs text-accent underline" href={r.caseId ? `/app/cases/${r.caseId}` : `/app/matters/${r.matterId}`}>{r.caseId ? "Open case" : "Open case"}</Link>
          )}
          <ReportBlock r={r} narrative={r.narrative} aiDrafted={r.aiDrafted} profile={profile} back="/app/reports" ai={ai} />
        </div>
      ))}
    </div>
  );
}
