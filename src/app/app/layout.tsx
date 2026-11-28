import Link from "next/link";
import { requireUser } from "@/lib/server/session";
import { can, ROLE_LABELS } from "@/lib/auth/permissions";
import { logoutAction } from "@/app/(auth)/actions";
import { SuggestFeature } from "@/components/suggest-feature";
import { AppShell, type NavItem } from "@/components/app-shell";
import { isPlatformAdmin } from "@/lib/server/feedback";
import { Announcements } from "@/components/announcements";
import { PageDuty } from "@/components/page-duty";

type Child = { href: string; label: string; icon: string; show?: boolean };
type Entry = Child & { children?: Child[] };
const strip = ({ href, label, icon }: Child): NavItem => ({ href, label, icon });

/** Pages reached through the tabs of their section rather than the menu (each page checks its own permission). */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireUser();
  const r = s.user.roles;
  // Menu [restructured 24 Nov 2026]: daily work first (clients, alerts, cases), then reporting, then the firm's
  // programme, team, settings and help. Pages that belong together share one entry with sub-items; there is no second menu across the top [27 Nov 2026].
  const entries: Entry[] = [
    { href: "/app", label: "Dashboard", icon: "dashboard" },
    {
      href: "/app/clients", label: "Clients", icon: "clients", show: can(r, "client.view"),
      children: [
        { href: "/app/clients", label: "All Clients", icon: "list" },
        { href: "/app/clients/new", label: "Add Client", icon: "add", show: can(r, "client.edit") },
        { href: "/app/identity-verification", label: "Identity Checks", icon: "idv" },
        { href: "/app/risk-assessments", label: "Risk Ratings", icon: "risk" },
        { href: "/app/remediation", label: "Import Clients", icon: "upload", show: can(r, "client.edit") },
        { href: "/app/clients/shared", label: "Shared Files", icon: "upload" },
        { href: "/app/tools/ownership-calculator", label: "Ownership Calculator", icon: "list" },
      ],
    },
    { href: "/app/monitoring-alerts", label: "Alerts", icon: "alerts", show: can(r, "client.view") },
    {
      href: "/app/matters", label: "Cases & Payments", icon: "matters", show: can(r, "client.view"),
      children: [
        { href: "/app/matters", label: "Cases", icon: "matters" },
        { href: "/app/transactions", label: "Transactions", icon: "transactions" },
        { href: "/app/transactions/import", label: "Import Transactions", icon: "upload", show: can(r, "client.edit") },
      ],
    },
    {
      href: can(r, "case.view") ? "/app/cases" : "/app/registers", label: "Reporting", icon: "cases",
      children: [
        { href: "/app/cases", label: "Investigations", icon: "cases", show: can(r, "case.view") },
        { href: "/app/reports", label: "Report Queue", icon: "report", show: can(r, "case.view") },
        { href: "/app/registers", label: "Registers & Exports", icon: "registers", show: can(r, "approve.compliance") },
      ],
    },
    {
      href: "/app/firm", label: "Compliance Hub", icon: "firm",
      children: [
        { href: "/app/firm", label: "Overview", icon: "list" },
        { href: "/app/obligations", label: "My Obligations", icon: "obligations" },
        { href: "/app/calendar", label: "Compliance Calendar", icon: "calendar" },
        { href: "/app/firm/risk-assessment", label: "Business Risk Assessment", icon: "risk" },
        { href: "/app/firm/policies", label: "AML Program", icon: "policies" },
        { href: "/app/firm/governance", label: "Roles and Duties", icon: "firm" },
        { href: "/app/firm/outsourcing", label: "Outsourcing", icon: "outsourcing" },
        { href: "/app/firm/whistleblowing", label: "Whistleblowing", icon: "whistle" },
        { href: "/app/firm/privacy", label: "Data Protection", icon: "privacy" },
        { href: "/app/firm/documents", label: "Firm Documents", icon: "folder" },
        { href: "/app/firm/review-pack", label: "Review Pack", icon: "report" },
        { href: "/app/audit-trail", label: "Audit Trail", icon: "audit", show: can(r, "securityLog.view") },
      ],
    },
    {
      href: "/app/team", label: "Team", icon: "team",
      children: [
        { href: "/app/team", label: "Members", icon: "team" },
        { href: "/app/firm/training", label: "My Training", icon: "training" },
        { href: "/app/team/training-register", label: "Training Register", icon: "training" },
        { href: "/app/firm/integrity", label: "Staff Checks", icon: "integrity" },
      ],
    },
    {
      href: "/app/settings", label: "Settings", icon: "settings",
      children: [
        { href: "/app/settings/country-profile", label: "Country Profile", icon: "country", show: can(r, "countryProfile.view") },
        { href: "/app/settings/transaction-monitoring", label: "Transaction Monitoring", icon: "transactions", show: can(r, "client.view") },
        { href: "/app/settings/screening-lists", label: "Screening Lists", icon: "screening", show: can(r, "countryProfile.view") },
        { href: "/app/billing", label: "Billing", icon: "billing", show: can(r, "approve.compliance") },
        { href: "/app/security", label: "Security", icon: "security" },
        { href: "/app/settings/email", label: "Email Settings", icon: "mail" },
        { href: "/app/settings/sample-data", label: "Sample Data", icon: "folder", show: can(r, "approve.compliance") },
        { href: "/app/records", label: "Records & Retention", icon: "records", show: can(r, "records.purge") },
      ],
    },
    {
      href: "/app/support", label: "Help", icon: "help",
      children: [
        { href: "/app/support", label: "Help Centre", icon: "help" },
        { href: "/app/feature-requests", label: "Feature Requests", icon: "ideas" },
      ],
    },
    ...(isPlatformAdmin(s.user.email)
      ? [{
          href: "/adminpage1&", label: "Backoffice", icon: "settings",
        }]
      : []),
  ];
  const nav: NavItem[] = entries
    .filter((e) => e.show !== false)
    .map((e) => ({ ...strip(e), ...(e.children ? { children: e.children.filter((k) => k.show !== false).map(strip) } : {}) }))
    .filter((e) => !e.children || e.children.length > 0);

  return (
    <AppShell
      nav={nav}
      firmName={s.firm.name}
      banner={s.firm.status === "cancelled" ? <>Subscription ended — read-only archive{s.firm.archiveUntil ? ` until ${s.firm.archiveUntil}` : ""}. <a className="underline" href="/app/billing">Download your full export</a></> : s.firm.status === "paused" || s.firm.status === "suspended" ? <>New checks and screenings are {s.firm.status} for your firm. Your records stay available. Questions: <Link className="underline" href="/app/support">Help Centre</Link></> : undefined}
      topRight={
        <>
          <span className="hidden sm:inline"><SuggestFeature /></span>
          <span className="hidden text-muted sm:inline" title={r.map((x) => ROLE_LABELS[x]).join(", ")}>
            {s.user.name}
            {s.user.external && <span className="ml-1 rounded border border-border px-1 text-xs">external</span>}
          </span>
          <form action={logoutAction}>
            <button type="submit" className="whitespace-nowrap rounded-full border border-border px-3 py-1 text-sm hover:border-accent">Sign out</button>
          </form>
        </>
      }
    >
      <Announcements firmId={s.firm.id} userId={s.user.id} />
      <PageDuty />
      {children}
    </AppShell>
  );
}
