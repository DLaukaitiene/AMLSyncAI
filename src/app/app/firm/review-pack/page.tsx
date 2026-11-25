import { Download } from "lucide-react";
import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { firmReviewPack } from "@/lib/server/review-pack";
import { DocView } from "@/components/doc-view";
import { PageTitle } from "@/components/help";

export default async function ReviewPackPage() {
  const s = await requireUser();
  const doc = await withTenant(s.firm.id, (tx) => firmReviewPack(tx, s.firm.id));
  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <PageTitle className="text-3xl" help={<>Every rule AMLSync App applies for your firm, in plain words: thresholds, deadlines, which checks are required, how risk is scored and when payments are flagged. Give it to your lawyer or accountant to confirm it fits your firm and country.</>}>Review Pack</PageTitle>
        </div>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- file download, not navigation */}
        <a href="/api/review-pack" className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-ink hover:brightness-105"><Download aria-hidden className="h-4 w-4" />Download PDF</a>
      </div>
      <div className="rounded-2xl border border-border bg-background p-6 shadow-[var(--shadow)]" data-testid="review-pack"><DocView doc={doc} /></div>
    </div>
  );
}
