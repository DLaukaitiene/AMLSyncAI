import "server-only";
import { adminDb } from "../db";
import { parseVies, splitVatId } from "@/lib/backoffice/ops";

/** VIES check of a firm's VAT ID (§9.3), via the European Commission's public REST API. */
export async function checkVies(firmId: string): Promise<{ status: string; name: string | null }> {
  const f = await adminDb.firm.findUniqueOrThrow({ where: { id: firmId }, select: { vatId: true } });
  const v = f.vatId ? splitVatId(f.vatId) : null;
  let r: { status: "valid" | "invalid" | "unavailable"; name: string | null };
  if (!v) r = { status: "invalid", name: null };
  else {
    try {
      const res = await fetch(`https://ec.europa.eu/taxation_customs/vies/rest-api/ms/${v.cc}/vat/${encodeURIComponent(v.number)}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000), cache: "no-store" });
      r = res.ok ? parseVies(await res.json()) : { status: "unavailable", name: null };
    } catch {
      r = { status: "unavailable", name: null };
    }
  }
  await adminDb.firm.update({ where: { id: firmId }, data: { viesStatus: r.status, viesName: r.name, viesCheckedAt: new Date() } });
  return r;
}
