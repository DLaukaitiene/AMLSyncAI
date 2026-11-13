import { NextResponse } from "next/server";
import { sendPortalReminders } from "@/lib/server/portal";
import { safeEqual } from "@/lib/server/crypto";

/** Portal auto-chasing (spec §4A.1). Run daily: Authorization: Bearer $CRON_SECRET */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await sendPortalReminders());
}
