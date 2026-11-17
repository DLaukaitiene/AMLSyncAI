import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/server/crypto";
import { issueMonthlyInvoices } from "@/lib/server/invoicing";

/** Monthly invoicing, run on the 1st (idempotent): Authorization: Bearer $CRON_SECRET */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await issueMonthlyInvoices());
}
