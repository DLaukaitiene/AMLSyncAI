import Link from "next/link";
import { requireAdmin } from "@/lib/server/backoffice/access";
import { adminDb } from "@/lib/server/db";
import { ADMIN_ROLE_LABELS, teamEnabled, type AdminPermission } from "@/lib/backoffice/roles";
import { logoutAction } from "@/app/(auth)/actions";

export const metadata = { title: "AMLSyncAI Backoffice", robots: { index: false, follow: false } };

/** Backoffice shell (docs/BACKOFFICE_SPEC.md). Non-admins get a 404. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const a = await requireAdmin();
  const pending = a.can("approvals.decide") ? await adminDb.adminApproval.count({ where: { status: "pending", expiresAt: { gt: new Date() } } }) : 0;
  const openTickets = a.can("tickets.manage") ? await adminDb.ticket.count({ where: { status: "open" } }) : 0;
  const nav: { href: string; label: string; p: AdminPermission }[] = [
    { href: "/adminpage1&", label: "Today", p: "dashboard.view" },
    { href: "/adminpage1&/firms", label: "Firms", p: "firms.view" },
    { href: "/adminpage1&/users", label: "Users", p: "users.view" },
    { href: "/adminpage1&/website", label: "Website", p: "web.view" },
    { href: "/adminpage1&/leads", label: "Leads", p: "leads.manage" },
    { href: "/adminpage1&/tickets", label: `Tickets${openTickets ? ` (${openTickets})` : ""}`, p: "tickets.manage" },
    { href: "/adminpage1&/comms", label: "Messages", p: "comms.manage" },
    { href: "/adminpage1&/expert", label: "Expert", p: "expert.manage" },
    { href: "/adminpage1&/revenue", label: "Revenue", p: "billing.view" },
    { href: "/adminpage1&/billing", label: "Billing ops", p: "billing.view" },
    { href: "/adminpage1&/security", label: "Security", p: "security.view" },
    { href: "/adminpage1&/abuse", label: "Bots & abuse", p: "abuse.view" },
    { href: "/adminpage1&/vendors", label: "Vendors & AI", p: "vendors.view" },
    { href: "/adminpage1&/content", label: "Rules content", p: "content.view" },
    { href: "/adminpage1&/support", label: "Support access", p: "support.access" },
    { href: "/adminpage1&/feature-requests", label: "Feature requests", p: "features.triage" },
    { href: "/adminpage1&/privacy", label: "Privacy", p: "privacy.view" },
    { href: "/adminpage1&/approvals", label: `Approvals${pending ? ` (${pending})` : ""}`, p: "dashboard.view" },
    ...(teamEnabled() ? [{ href: "/adminpage1&/team", label: "Admin team", p: "team.manage" as AdminPermission }] : []),
    { href: "/adminpage1&/audit", label: "Admin log", p: "audit.view" },
  ];
  return (
    <div className="min-h-screen border-t-4 border-amber-500">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-sm">
          <Link href="/adminpage1&" className="font-semibold">AMLSyncAI Backoffice</Link>
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
