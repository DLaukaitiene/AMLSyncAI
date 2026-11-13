import { NextResponse } from "next/server";
import { adminDb } from "@/lib/server/db";
import { rescreenFirm } from "@/lib/server/screening-lists";
import { safeEqual } from "@/lib/server/crypto";

/**
 * Daily re-screening of all firms (spec §4.4, §11.8: within 24 hours of a new list version).
 * Call from the scheduler with:  Authorization: Bearer $CRON_SECRET
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const firms = await adminDb.firm.findMany({ select: { id: true } });
  let hits = 0;
  for (const f of firms) hits += (await rescreenFirm(f.id)).newHits;
  return NextResponse.json({ firms: firms.length, newHits: hits });
}
