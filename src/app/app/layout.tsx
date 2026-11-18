import { requireUser } from "@/lib/server/session";
import { can, ROLE_LABELS } from "@/lib/auth/permissions";
import { logoutAction } from "@/app/(auth)/actions";
import { SuggestFeature } from "@/components/suggest-feature";
import { AppShell, type NavItem } from "@/components/app-shell";
import { isPlatformAdmin } from "@/lib/server/feedback";
import { Announcements } from "@/components/announcements";

type Child = { href: string; label: string; icon: string; show?: boolean };
type Entry = Child & { children?: Child[] };
const strip = ({ href, label, icon }: Child): NavItem => ({ href, label, icon });

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireUser();
  const r = s.user.roles;
  const entries: Entry[] = [
    { href: "/app", label: "Dashboard", icon: "dashboard" },
    {
      href: "/app/clients", label: "Clients", icon: "clients", show: can(r, "client.view"),
      children: [
        { href: "/app/clients", label: "All clients", icon: "list" },
        { href: "/app/clients/new", label: "New client", icon: "add", show: can(r, "client.edit") },
        { href: "/app/remediation", label: "Import existing clients", icon: "upload", show: can(r, "client.edit") },
      ],
    },
    {
      href: "/app/matters", label: "Matters", icon: "matters", show: can(r, "client.view"),
      children: [
        { href: "/app/matters", label: "All matters", icon: "list" },
        { href: "/app/matters/new", label: "New matter", icon: "newMatter", show: can(r, "client.edit") },
      ],
    },
    { href: "/app/calendar", label: "Compliance calendar", icon: "calendar" },
    {
      href: "/app/cases", label: "Suspicions & reports", icon: "cases", show: can(r, "case.view"),
      children: [
        { href: "/app/cases", label: "Cases", icon: "cases" },
        { href: "/app/reports", label: "FIU reports", icon: "report" },
      ],
    },
    {
      href: "/app/firm", label: "Firm compliance", icon: "firm",
      children: [
        { href: "/app/firm", label: "Overview", icon: "list" },
        { href: "/app/firm/risk-assessment", label: "Risk assessment", icon: "risk" },
        { href: "/app/firm/policies", label: "Policies & procedures", icon: "policies" },
        { href: "/app/firm/governance", label: "Governance", icon: "firm" },
        { href: "/app/firm/training", label: "Training", icon: "training" },
        { href: "/app/firm/integrity", label: "Integrity checks", icon: "integrity" },
        { href: "/app/firm/whistleblowing", label: "Whistleblowing", icon: "whistle" },
        { href: "/app/firm/outsourcing", label: "Outsourcing", icon: "outsourcing" },
        { href: "/app/firm/privacy", label: "Privacy", icon: "privacy" },
      ],
    },
    {
      href: "/app/settings", label: "Settings", icon: "settings",
      children: [
        { href: "/app/settings/country-profile", label: "Country Profile", icon: "country", show: can(r, "countryProfile.view") },
        { href: "/app/settings/screening-lists", label: "Screening lists", icon: "screening", show: can(r, "countryProfile.view") },
        { href: "/app/team", label: "Team", icon: "team" },
        { href: "/app/billing", label: "Billing", icon: "billing", show: can(r, "approve.compliance") },
        { href: "/app/security", label: "Security log", icon: "security", show: can(r, "securityLog.view") },
        { href: "/app/records", label: "Records & retention", icon: "records", show: can(r, "records.purge") },
      ],
    },
    { href: "/app/feature-requests", label: "Feature requests", icon: "ideas" },
    { href: "/app/support", label: "Help & support", icon: "help" },
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
      banner={s.firm.status === "cancelled" ? <>Subscription ended — read-only archive{s.firm.archiveUntil ? ` until ${s.firm.archiveUntil}` : ""}. <a className="underline" href="/app/billing">Download your full export</a></> : undefined}
      topRight={
        <>
          <SuggestFeature />
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
      {children}
    </AppShell>
  );
}
