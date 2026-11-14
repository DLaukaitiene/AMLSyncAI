import { NextResponse } from "next/server";
import { adminDb } from "@/lib/server/db";
import { sha256 } from "@/lib/server/crypto";
import { refreshDiditSession } from "@/lib/server/didit";

/** Didit sends the client back here after the identity check; fetch the result, then back to the portal. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await adminDb.portalLink.findUnique({ where: { tokenHash: sha256(token) } });
  if (link) {
    const s = await adminDb.diditSession.findFirst({ where: { partyId: link.partyId, kind: "idv" }, orderBy: { createdAt: "desc" } });
    if (s) await refreshDiditSession(link.firmId, s.diditSessionId).catch(() => {});
  }
  return NextResponse.redirect(new URL(`/p/${token}?idv=1`, req.url));
}
