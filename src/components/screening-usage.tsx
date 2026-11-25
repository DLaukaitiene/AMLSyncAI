import { ActionForm, Submit } from "@/components/form";
import { buyScreeningPackAction, requestMoreScreeningsAction } from "@/app/app/screening-actions";
import { SCREEN_PACK } from "@/lib/security/screening-caps";
import { formatEur } from "@/lib/didit/map";
import type { Limits, Used } from "@/lib/security/screening-caps";
import { Help } from "@/components/help";

/** Screening usage against the plan's limits, with the button to ask for more. */
export function ScreeningUsage({ limits, used, compact = false }: { limits: Limits; used: Used; compact?: boolean }) {
  const dayFull = used.today >= limits.perDay, monthFull = used.thisMonth >= limits.perMonth;
  const near = used.today >= limits.perDay * 0.8 || used.thisMonth >= limits.perMonth * 0.8;
  if (compact && !near) return null;
  return (
    <section className={`space-y-2 rounded-2xl border p-4 text-sm ${dayFull || monthFull ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950" : near ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950" : "border-border"}`} data-testid="screening-usage">
      <p className="font-semibold">{dayFull || monthFull ? "Screening limit reached" : near ? "Screening limit nearly reached" : "Screenings"}: {used.today} of {limits.perDay} today · {used.thisMonth} of {limits.perMonth} this month</p>
      <div className="flex items-start gap-2 text-muted"><p>Limits apply to screenings you start by hand.</p><Help>Automatic re-screening of your clients is not limited. Extra screenings are added to this month (and today) at once and appear on your next invoice. For a permanently higher limit, request it and we adjust it within 1 business day.</Help></div>
      <div className="flex flex-wrap gap-2">
        <ActionForm action={buyScreeningPackAction}><Submit variant={dayFull || monthFull ? "primary" : "secondary"}>{`Buy ${SCREEN_PACK.screenings} more screenings (${formatEur(SCREEN_PACK.cents)})`}</Submit></ActionForm>
        <ActionForm action={requestMoreScreeningsAction}><Submit variant="secondary">Request more screenings</Submit></ActionForm>
      </div>
    </section>
  );
}
