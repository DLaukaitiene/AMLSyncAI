import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { adminDb, withTenant } from "@/lib/server/db";
import { can } from "@/lib/auth/permissions";
import { hasAdminPermission } from "@/lib/server/backoffice/access";
import { invoicePdf } from "@/lib/server/invoice-pdf";

/** VAT invoice PDF (PVM sąskaita faktūra) for the firm's own billing users, or AMLSync admins. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSession();
  if (!s || s.stage !== "ACTIVE" || !/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });
  const inv = (await hasAdminPermission(s.user.email, "billing.view"))
    ? await adminDb.invoice.findUnique({ where: { id } })
    : can(s.user.roles, "approve.compliance") ? await withTenant(s.firm.id, (tx) => tx.invoice.findUnique({ where: { id } })) : null;
  if (!inv) return new NextResponse("Not found", { status: 404 });
  const pdf = await invoicePdf(inv);
  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${inv.number}.pdf"`, "Cache-Control": "private, no-store" } });
}
