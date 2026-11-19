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
import { createBackup } from "@/lib/server/backup";
import { sendEmail } from "@/lib/server/email";

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
  const failed: string[] = [];
  // Record the run; a gap since the last one means a run was missed (host outage, cron misconfigured).
  const previous = await adminDb.jobRun.findFirst({ where: { job: "daily" }, orderBy: { startedAt: "desc" } });
  const runRow = await adminDb.jobRun.create({ data: { job: "daily", failed: [] } });
  const run = async (name: string, job: () => Promise<unknown>) => {
    try {
      out[name] = await job();
    } catch (e) {
      out[name] = { error: (e as Error).message.slice(0, 200) };
      failed.push(name);
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
  // Weekly encrypted backup (Mondays, or when the last one is over 7 days old), emailed to operations.
  const lastBackup = await adminDb.jobRun.findFirst({ where: { job: "backup", ok: true }, orderBy: { startedAt: "desc" } });
  if (new Date().getUTCDay() === 1 || !lastBackup || Date.now() - lastBackup.startedAt.getTime() > 7.5 * 86_400_000) {
    await run("backup", async () => {
      const b = await createBackup();
      const mb = b.file.length / 1_048_576;
      const total = Object.values(b.rows).reduce((a, n) => a + n, 0);
      // Gmail accepts attachments up to 25 MB; above ~18 MB download it from the backoffice instead.
      if (mb <= 18) {
        await sendEmail(OPS_ALERT_EMAIL, `AMLSync App: weekly backup ${b.name.slice(15, 25)}`, `The weekly encrypted backup is attached (${mb.toFixed(2)} MB, ${total} rows in ${Object.keys(b.rows).length} tables).\n\nKeep it somewhere safe outside Google (e.g. download it to your computer). It can only be opened with BACKUP_KEY; restore steps are in scripts/restore-backup.mts.`, [{ filename: b.name, content: b.file, contentType: "application/octet-stream" }]);
      } else {
        await sendEmail(OPS_ALERT_EMAIL, `AMLSync App: weekly backup ready to download`, `The weekly backup (${mb.toFixed(1)} MB) is too large for email. Download it from the backoffice: Security → Download backup.`);
      }
      await adminDb.jobRun.create({ data: { job: "backup", ok: true, finishedAt: new Date(), failed: [], summary: { bytes: b.file.length, rows: total, emailed: mb <= 18 } } });
      return { bytes: b.file.length, rows: total, emailed: mb <= 18 };
    });
  }
  await adminDb.jobRun.update({ where: { id: runRow.id }, data: { finishedAt: new Date(), ok: failed.length === 0, failed, summary: out as object } });
  const gapHours = previous ? (Date.now() - previous.startedAt.getTime()) / 3_600_000 : 0;
  const problems = [
    ...failed.map((n) => `- ${n}: ${(out[n] as { error: string }).error}`),
    ...(previous && !previous.finishedAt ? [`- The previous run (${previous.startedAt.toISOString()}) never finished (timeout or crash).`] : []),
    ...(gapHours > 36 ? [`- No run for ${Math.round(gapHours)} hours before this one: at least one daily run was missed.`] : []),
  ];
  if (problems.length) {
    await notify(OPS_ALERT_EMAIL, `AMLSync App: daily job had ${problems.length} problem(s)`,
      `The daily job (re-screening, reminders, refreshes, invoices, company checks) ran at ${runRow.startedAt.toISOString()} with problems:\n\n${problems.join("\n")}\n\nThe other parts ran normally. Each part is safe to re-run: the job runs again tomorrow, or trigger it from Vercel → Cron Jobs → Run.`);
  }
  return NextResponse.json({ ...out, failed });
}
