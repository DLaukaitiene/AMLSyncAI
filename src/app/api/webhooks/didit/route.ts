import { NextResponse } from "next/server";
import { verifyDiditWebhook } from "@/lib/didit/signature";
import { handleDiditWebhook } from "@/lib/server/didit";
import { hit } from "@/lib/server/rate-limit";
import { securityEvent } from "@/lib/server/audit";

/**
 * Didit webhook (status.updated / data.updated). Verified with X-Signature-V2
 * (or its -Previous during secret rotation), idempotent on event_id. The
 * decision is always re-fetched from the API rather than trusted from the body.
 */
export async function POST(req: Request) {
  const secret = process.env.DIDIT_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "not configured" }, { status: 503 });
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const v = verifyDiditWebhook(body, {
    signatureV2: req.headers.get("x-signature-v2"),
    signatureV2Previous: req.headers.get("x-signature-v2-previous"),
    timestamp: req.headers.get("x-timestamp"),
  }, secret);
  if (!v.ok) {
    await securityEvent({ kind: "webhook-rejected", details: { provider: "didit", reason: v.reason } });
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  const eventId = String(body.event_id ?? `${body.session_id}:${body.status}:${body.webhook_type}`);
  if (!(await hit(`didit-event:${eventId}`, { limit: 1, windowSec: 7 * 86_400 }))) return NextResponse.json({ ok: true, duplicate: true });
  if (!["status.updated", "data.updated"].includes(String(body.webhook_type)) || !body.session_id) return NextResponse.json({ ok: true, ignored: true });
  try {
    const r = await handleDiditWebhook(String(body.session_id));
    return NextResponse.json({ ok: true, ...r });
  } catch {
    // 5xx makes Didit retry (about 1 and 5 minutes later).
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
