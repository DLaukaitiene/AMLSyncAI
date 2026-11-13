import { NextResponse } from "next/server";
import { adminDb } from "@/lib/server/db";
import { startDueRefreshes } from "@/lib/server/portal";
import { safeEqual } from "@/lib/server/crypto";

/** Daily CDD refresh run (spec §4A.5): Authorization: Bearer $CRON_SECRET */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const firms = await adminDb.firm.findMany({ select: { id: true } });
  let due = 0, sent = 0;
  for (const f of firms) {
    const r = await startDueRefreshes(f.id);
    due += r.due;
    sent += r.sent;
  }
  return NextResponse.json({ firms: firms.length, due, sent });
}
