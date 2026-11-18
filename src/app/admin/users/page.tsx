import Link from "next/link";
import { requireAdmin } from "@/lib/server/backoffice/access";
import { adminDb } from "@/lib/server/db";
import { Badge, fmtDateTime, Page, Table } from "@/components/admin";
import { ROLE_LABELS, type AppRole } from "@/lib/auth/permissions";

type SP = { q?: string; mfa?: string; locked?: string };

export default async function UsersPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin("users.view");
  const sp = await searchParams;
  const q = sp.q?.trim();
  const now = new Date();
  const users = await adminDb.user.findMany({
    where: {
      ...(q ? { OR: [{ email: { contains: q.toLowerCase() } }, { name: { contains: q, mode: "insensitive" } }, { firm: { name: { contains: q, mode: "insensitive" } } }, ...(/^[0-9a-f-]{36}$/i.test(q) ? [{ id: q }] : [])] } : {}),
      ...(sp.mfa === "0" ? { mfaEnrolledAt: null, deactivatedAt: null } : {}),
      ...(sp.locked === "1" ? { lockedUntil: { gt: now } } : {}),
    },
    orderBy: { createdAt: "desc" }, take: 200,
    select: { id: true, name: true, email: true, roles: true, external: true, mfaEnrolledAt: true, lockedUntil: true, deactivatedAt: true, failedLogins: true, createdAt: true, firm: { select: { id: true, name: true } } },
  });
  const seen = new Map((await adminDb.session.groupBy({ by: ["userId"], where: { userId: { in: users.map((u) => u.id) } }, _max: { lastSeenAt: true } })).map((s) => [s.userId, s._max.lastSeenAt]));
  const input = "rounded border border-border bg-background px-2 py-1";
  return (
    <Page title="Users" intro="Every user across all firms: firm staff only. AMLSync never sees the people firms check.">
      <form className="flex flex-wrap gap-2 text-sm" role="search">
        <input name="q" defaultValue={q} placeholder="Email, name, firm or user ID" aria-label="Search users" className={`${input} min-w-72`} />
        <label className="flex items-center gap-1"><input type="checkbox" name="mfa" value="0" defaultChecked={sp.mfa === "0"} /> Two-factor not set up</label>
        <label className="flex items-center gap-1"><input type="checkbox" name="locked" value="1" defaultChecked={sp.locked === "1"} /> Locked</label>
        <button className="rounded border border-border px-3 py-1">Search</button>
      </form>
      <Table testId="user-list" head={["User", "Firm", "Roles", "Two-factor", "Failed sign-ins", "Last seen", "State"]} rows={users.map((u) => [
        <span key="u"><Link href={`/admin/users/${u.id}`} className="text-accent underline">{u.name}</Link><br /><span className="text-xs text-muted">{u.email}</span></span>,
        <Link key="f" href={`/admin/firms/${u.firm.id}`} className="underline">{u.firm.name}</Link>,
        u.roles.map((r) => ROLE_LABELS[r as AppRole]).join(", ") + (u.external ? " (external)" : ""),
        u.mfaEnrolledAt ? <Badge key="m" tone="ok">on</Badge> : <Badge key="m" tone="bad">not set up</Badge>,
        u.failedLogins, fmtDateTime(seen.get(u.id)),
        u.deactivatedAt ? "removed" : u.lockedUntil && u.lockedUntil > now ? <Badge key="l" tone="bad">locked</Badge> : "active",
      ])} empty="No users match." />
    </Page>
  );
}
