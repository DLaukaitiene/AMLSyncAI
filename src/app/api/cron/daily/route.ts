import { NextResponse } from "next/server";
import { adminDb } from "@/lib/server/db";
import { safeEqual } from "@/lib/server/crypto";
import { rescreenFirm } from "@/lib/server/screening-lists";
import { sendPortalReminders, startDueRefreshes } from "@/lib/server/portal";
import { issueMonthlyInvoices } from "@/lib/server/invoicing";

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
  const firms = await adminDb.firm.findMany({ select: { id: true } });
  await run("rescreen", async () => {
    let newHits = 0;
    for (const f of firms) newHits += (await rescreenFirm(f.id)).newHits;
    return { firms: firms.length, newHits };
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
  return NextResponse.json(out);
}
