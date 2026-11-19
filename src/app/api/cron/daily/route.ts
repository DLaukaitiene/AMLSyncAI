import { NextResponse } from "next/server";
import { adminDb } from "@/lib/server/db";
import { safeEqual } from "@/lib/server/crypto";
import { rescreenFirm } from "@/lib/server/screening-lists";
import { sendPortalReminders, startDueRefreshes } from "@/lib/server/portal";
import { issueMonthlyInvoices } from "@/lib/server/invoicing";
import { refreshCompanyCheck } from "@/lib/server/kyb";
import { withTenant } from "@/lib/server/db";
import { rescreenStaffIfListsChanged } from "@/lib/server/staff-screening";
import { hit } from "@/lib/server/rate-limit";
import { notify } from "@/lib/server/email";
import { OPS_ALERT_EMAIL } from "@/lib/billing/plans";

export const maxDuration = 300;

/**
 * All daily jobs in one call, for hosts that allow one scheduled job a day
 * (Vercel Hobby sends GET with Authorization: Bearer $CRON_SECRET).
 * Each job is idempotent; one failing job doesn't stop the others.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const out: Record<string, unknown> = {};
  const run = async (name: string, job: () => Promise<unknown>) => {
    try {
      out[name] = await job();
    } catch (e) {
      out[name] = { error: (e as Error).message.slice(0, 200) };
    }
  };
  // Archived (cancelled) firms: no re-screening, refreshes or reminders — records are read-only.
  const firms = await adminDb.firm.findMany({ where: { status: "active" }, select: { id: true } });
  await run("rescreen", async () => {
    let newHits = 0;
    for (const f of firms) newHits += (await rescreenFirm(f.id)).newHits;
    return { firms: firms.length, newHits };
  });
  await run("staffScreening", async () => {
    let screened = 0, possible = 0;
    for (const f of firms) {
      const r = await withTenant(f.id, (tx) => rescreenStaffIfListsChanged(tx, f.id), { timeoutMs: 60_000 });
      screened += r.screened;
      possible += r.possible;
    }
    return { screened, possible };
  });
  await run("refresh", async () => {
    let due = 0, sent = 0;
    for (const f of firms) {
      const r = await startDueRefreshes(f.id);
      due += r.due;
      sent += r.sent;
    }
    return { due, sent };
  });
  await run("portalReminders", () => sendPortalReminders());
  await run("invoices", () => issueMonthlyInvoices());
  await run("archivesEnded", async () => {
    // Read-only archives whose retention period ended: AMLSync operations deletes them.
    const today = new Date().toISOString().slice(0, 10);
    const ended = await adminDb.firm.findMany({ where: { status: "cancelled", archiveUntil: { lte: today } }, select: { id: true, name: true, archiveUntil: true } });
    for (const f of ended) {
      if (await hit(`archive-ended:${f.id}:${today.slice(0, 7)}`, { limit: 1, windowSec: 40 * 86_400 })) {
        await notify(OPS_ALERT_EMAIL, `AMLSync App: archive of ${f.name} ended`, `The read-only archive of ${f.name} ended on ${f.archiveUntil}. Its records must now be deleted (firm id ${f.id}).`);
      }
    }
    return { ended: ended.length };
  });
  await run("companyChecks", async () => {
    // Register checks whose ownership data arrived after the first request.
    const pending = await adminDb.diditSession.findMany({ where: { kind: "kyb", importedAt: null }, select: { firmId: true, diditSessionId: true } });
    let imported = 0;
    for (const k of pending) if ((await refreshCompanyCheck(k.firmId, k.diditSessionId).catch(() => ({ imported: false }))).imported) imported++;
    return { pending: pending.length, imported };
  });
  return NextResponse.json(out);
}
