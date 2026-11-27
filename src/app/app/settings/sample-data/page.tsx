import { requireUser } from "@/lib/server/session";
import { adminDb, withTenant } from "@/lib/server/db";
import { hasSampleData } from "@/lib/server/sample-data";
import { ActionButton } from "@/components/action-button";
import { PageTitle } from "@/components/help";
import { loadSampleAction, removeSampleAction, setSampleHintAction } from "@/app/app/sample-actions";

export default async function SampleDataSettingsPage() {
  const s = await requireUser("approve.compliance");
  const sample = await withTenant(s.firm.id, (tx) => hasSampleData(tx));
  const me = await adminDb.user.findUniqueOrThrow({ where: { id: s.user.id }, select: { sampleHintHiddenAt: true } });
  return (
    <div className="max-w-2xl space-y-6">
      <PageTitle className="text-3xl" help={<>Made-up clients, a company with owners, and a case with payments that raise red flags, so you can try the app safely. Remove them before you add real clients.</>}>Sample data</PageTitle>
      <section className={`space-y-3 rounded-2xl border p-4 text-sm ${sample ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950" : "border-border"}`} data-testid="settings-sample-data">
        {sample ? (
          <>
            <p><strong>Sample data is loaded.</strong> The clients and cases are made up and marked &ldquo;sample&rdquo;, so you can safely try the app out. We recommend removing them before adding real clients.</p>
            <ActionButton action={removeSampleAction}>Remove sample data</ActionButton>
          </>
        ) : (
          <>
            <p><strong>No sample data loaded.</strong> Load it to see how the app works: 3 made-up clients, a company with two owners, and a case with 4 payments. You can remove it in one click.</p>
            <ActionButton action={loadSampleAction} variant="primary">Load sample data</ActionButton>
          </>
        )}
      </section>
      {!sample && me.sampleHintHiddenAt && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border p-4 text-sm">
          <p>You closed the sample data box on the dashboard.</p>
          <form action={setSampleHintAction.bind(null, false)}><button type="submit" className="rounded-full border border-border px-4 py-1.5 hover:border-accent">Show it on the dashboard again</button></form>
        </section>
      )}
    </div>
  );
}
