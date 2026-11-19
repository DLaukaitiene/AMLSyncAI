import { requireAdmin } from "@/lib/server/backoffice/access";
import { adminDb } from "@/lib/server/db";
import { verifyAdminAudit } from "@/lib/server/backoffice/audit";
import { Badge, fmtDateTime, Page, Section, Table } from "@/components/admin";

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ admin?: string; action?: string }> }) {
  await requireAdmin("audit.view");
  const sp = await searchParams;
  const [rows, chain] = await Promise.all([
    adminDb.adminAuditEvent.findMany({ where: { ...(sp.admin ? { adminEmail: sp.admin.toLowerCase() } : {}), ...(sp.action ? { action: { startsWith: sp.action } } : {}) }, orderBy: { id: "desc" }, take: 300 }),
    verifyAdminAudit(),
  ]);
  return (
    <Page title="Admin log" intro="Append-only and hash-chained: each entry's hash covers the previous one, so any edit or deletion breaks the chain."
      actions={<span data-testid="chain">{chain.brokenAt === null ? <Badge tone="ok">chain intact · {chain.count} entries</Badge> : <Badge tone="bad">chain broken at entry {String(chain.brokenAt)}</Badge>}</span>}>
      <form className="flex flex-wrap gap-2 text-sm">
        <input name="admin" defaultValue={sp.admin} placeholder="Admin email" aria-label="Admin email" className="rounded border border-border bg-background px-2 py-1" />
        <input name="action" defaultValue={sp.action} placeholder="Action (e.g. firm.)" aria-label="Action" className="rounded border border-border bg-background px-2 py-1" />
        <button className="rounded border border-border px-3 py-1">Filter</button>
      </form>
      <Section title={`${rows.length} entries`}>
        <Table head={["#", "When (UTC)", "Admin", "Action", "Target", "Reason", "Approved by", "Hash"]} rows={rows.map((r) => [String(r.id), fmtDateTime(r.at), r.adminEmail, r.action, `${r.targetType}${r.targetId ? ` ${r.targetId.slice(0, 8)}` : ""}`, r.reason ?? "—", r.approverEmail ?? "—", <code key="h" className="text-xs">{r.hash.slice(0, 12)}</code>])} />
      </Section>
    </Page>
  );
}
