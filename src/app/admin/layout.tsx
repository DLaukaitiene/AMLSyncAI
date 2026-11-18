import Link from "next/link";
import { requireAdmin } from "@/lib/server/backoffice/access";
import { adminDb } from "@/lib/server/db";
import { ADMIN_ROLE_LABELS, type AdminPermission } from "@/lib/backoffice/roles";
import { logoutAction } from "@/app/(auth)/actions";

export const metadata = { title: "AMLSyncAI Backoffice", robots: { index: false, follow: false } };

/** Backoffice shell (docs/BACKOFFICE_SPEC.md). Non-admins get a 404. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const a = await requireAdmin();
  const pending = a.can("approvals.decide") ? await adminDb.adminApproval.count({ where: { status: "pending", expiresAt: { gt: new Date() } } }) : 0;
  const nav: { href: string; label: string; p: AdminPermission }[] = [
    { href: "/admin", label: "Today", p: "dashboard.view" },
    { href: "/admin/firms", label: "Firms", p: "firms.view" },
    { href: "/admin/users", label: "Users", p: "users.view" },
    { href: "/admin/revenue", label: "Revenue", p: "billing.view" },
    { href: "/admin/billing", label: "Billing ops", p: "billing.view" },
    { href: "/admin/security", label: "Security", p: "security.view" },
    { href: "/admin/abuse", label: "Bots & abuse", p: "abuse.view" },
    { href: "/admin/vendors", label: "Vendors & AI", p: "vendors.view" },
    { href: "/admin/content", label: "Rules content", p: "content.view" },
    { href: "/admin/support", label: "Support access", p: "support.access" },
    { href: "/admin/feature-requests", label: "Feature requests", p: "features.triage" },
    { href: "/admin/privacy", label: "Privacy", p: "privacy.view" },
    { href: "/admin/approvals", label: `Approvals${pending ? ` (${pending})` : ""}`, p: "dashboard.view" },
    { href: "/admin/team", label: "Admin team", p: "team.manage" },
    { href: "/admin/audit", label: "Admin log", p: "audit.view" },
  ];
  return (
    <div className="min-h-screen border-t-4 border-amber-500">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-sm">
          <Link href="/admin" className="font-semibold">AMLSyncAI Backoffice</Link>
          <span className="text-muted">Internal. Every action is logged. No access to client files or suspicion reports.</span>
          <form action={logoutAction} className="ml-auto flex items-center gap-3">
            <span className="text-muted" title={a.roles.map((r) => ADMIN_ROLE_LABELS[r]).join(", ")}>{a.email} · {a.roles.map((r) => ADMIN_ROLE_LABELS[r]).join(", ")}</span>
            <Link href="/app" className="text-muted underline">Firm app</Link>
            <button type="submit" className="text-muted underline hover:text-foreground">Sign out</button>
          </form>
        </div>
        <nav aria-label="Backoffice" className="mx-auto flex max-w-7xl gap-4 overflow-x-auto px-4 pb-2 text-sm">
          {nav.filter((n) => a.can(n.p)).map((n) => <Link key={n.href} href={n.href} className="whitespace-nowrap text-muted hover:text-foreground">{n.label}</Link>)}
        </nav>
      </header>
      {children}
    </div>
  );
}
