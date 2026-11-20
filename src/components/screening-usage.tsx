import { ActionForm, Submit } from "@/components/form";
import { requestMoreScreeningsAction } from "@/app/app/screening-actions";
import type { Limits, Used } from "@/lib/security/screening-caps";

/** Screening usage against the plan's limits, with the button to ask for more. */
export function ScreeningUsage({ limits, used, compact = false }: { limits: Limits; used: Used; compact?: boolean }) {
  const dayFull = used.today >= limits.perDay, monthFull = used.thisMonth >= limits.perMonth;
  const near = used.today >= limits.perDay * 0.8 || used.thisMonth >= limits.perMonth * 0.8;
  if (compact && !near) return null;
  return (
    <section className={`space-y-2 rounded-2xl border p-4 text-sm ${dayFull || monthFull ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950" : near ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950" : "border-border"}`} data-testid="screening-usage">
      <p className="font-semibold">{dayFull || monthFull ? "Screening limit reached" : near ? "Screening limit nearly reached" : "Screenings"}: {used.today} of {limits.perDay} today · {used.thisMonth} of {limits.perMonth} this month</p>
      <p className="text-muted">For your security there is a limit on screenings started by hand (automatic re-screening of your clients is not limited). Need more? Press the button or write to contact@amlsync.com: we adjust your limit within 1 business day.</p>
      <ActionForm action={requestMoreScreeningsAction}><Submit variant="secondary">Request more screenings</Submit></ActionForm>
    </section>
  );
}
