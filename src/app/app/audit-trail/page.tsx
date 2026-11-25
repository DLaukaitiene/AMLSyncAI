import Link from "next/link";
import { Download } from "lucide-react";
import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { can } from "@/lib/auth/permissions";
import { OBJECT_LABEL } from "@/lib/audit-labels";
import { PageTitle } from "@/components/help";

const PAGE = 50;
const ACTIONS = ["create", "update", "delete", "view", "export", "approve", "screen", "purge"];

export default async function AuditTrailPage({ searchParams }: { searchParams: Promise<{ action?: string; user?: string; page?: string }> }) {
  const s = await requireUser("securityLog.view");
  const q = await searchParams;
  const action = ACTIONS.includes(q.action ?? "") ? q.action! : undefined;
  const page = Math.max(1, Number(q.page) || 1);
  const data = await withTenant(s.firm.id, async (tx) => {
    const users = await tx.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
    const userId = users.some((u) => u.id === q.user) ? q.user : undefined;
    const where = { ...(action ? { action } : {}), ...(userId ? { userId } : {}) };
    return {
      users, userId,
      total: await tx.auditEvent.count({ where }),
      events: await tx.auditEvent.findMany({ where, orderBy: { at: "desc" }, skip: (page - 1) * PAGE, take: PAGE }),
    };
  });
  const names = new Map(data.users.map((u) => [u.id, u.name]));
  const qs = (p: number) => `/app/audit-trail?${new URLSearchParams({ ...(action ? { action } : {}), ...(data.userId ? { user: data.userId } : {}), page: String(p) })}`;
  const pages = Math.max(1, Math.ceil(data.total / PAGE));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <PageTitle className="text-3xl" help={<>Every action in your firm&apos;s account, newest first. It can&apos;t be edited or deleted by anyone. Field names are recorded, never their values.</>}>Audit Trail</PageTitle>
        </div>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- file download, not navigation */}
        {can(s.user.roles, "approve.compliance") && <a href="/api/registers/audit" className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm hover:border-accent"><Download aria-hidden className="h-4 w-4" />Export CSV</a>}
      </div>
      <form className="flex flex-wrap items-end gap-3 text-sm" method="get">
        <label className="space-y-1"><span className="block text-muted">Action</span>
          <select name="action" defaultValue={action ?? ""} className="rounded-lg border border-border bg-background px-3 py-2"><option value="">All actions</option>{ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}</select>
        </label>
        <label className="space-y-1"><span className="block text-muted">User</span>
          <select name="user" defaultValue={data.userId ?? ""} className="rounded-lg border border-border bg-background px-3 py-2"><option value="">All users</option>{data.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        </label>
        <button type="submit" className="rounded-full border border-border px-4 py-2 hover:border-accent">Filter</button>
        <span className="text-muted">{data.total} record(s)</span>
      </form>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-muted"><tr><th className="px-4 py-2 font-medium">When (UTC)</th><th className="px-4 py-2 font-medium">User</th><th className="px-4 py-2 font-medium">Action</th><th className="px-4 py-2 font-medium">Record</th><th className="px-4 py-2 font-medium">Fields</th></tr></thead>
          <tbody className="divide-y divide-border">
            {data.events.map((e) => (
              <tr key={String(e.id)}>
                <td className="whitespace-nowrap px-4 py-2 text-muted">{e.at.toISOString().slice(0, 19).replace("T", " ")}</td>
                <td className="px-4 py-2">{e.userId ? names.get(e.userId) ?? "Former user" : "System"}</td>
                <td className="px-4 py-2">{e.action}</td>
                <td className="px-4 py-2">{e.objectType === "CddFile" && e.action !== "purge" ? <Link className="text-accent hover:underline" href={`/app/clients/${e.objectId}`}>{OBJECT_LABEL[e.objectType]}</Link> : OBJECT_LABEL[e.objectType] ?? e.objectType} <span className="text-xs text-muted">{e.objectId.slice(0, 8)}</span></td>
                <td className="px-4 py-2 text-muted">{e.fields.join(", ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-between text-sm">
          {page > 1 ? <Link href={qs(page - 1)} className="rounded-full border border-border px-3 py-1 hover:border-accent">Previous</Link> : <span />}
          <span className="text-muted">Page {page} of {pages}</span>
          {page < pages ? <Link href={qs(page + 1)} className="rounded-full border border-border px-3 py-1 hover:border-accent">Next</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
