import Link from "next/link";
import { requireUser } from "@/lib/server/session";
import { can, ROLE_LABELS } from "@/lib/auth/permissions";
import { logoutAction } from "@/app/(auth)/actions";
import { SuggestFeature } from "@/components/suggest-feature";
import { AppShell, type NavItem, type NavSection } from "@/components/app-shell";
import { isPlatformAdmin } from "@/lib/server/feedback";
import { Announcements } from "@/components/announcements";

type Entry = { href: string; label: string; icon: string; exact?: boolean; show?: boolean; children?: Entry[] };
type Section = { label?: string; items: Entry[] };

/** Drops entries the user may not see and subsections left empty, then sections left empty. */
function visible(sections: Section[]): NavSection[] {
  const keep = (e: Entry): NavItem | null => {
    if (e.show === false) return null;
    const item: NavItem = { href: e.href, label: e.label, icon: e.icon, ...(e.exact ? { exact: true } : {}) };
    if (!e.children) return item;
    const children = e.children.map(keep).filter((x): x is NavItem => !!x);
    return children.length ? { ...item, children } : null;
  };
  return sections
    .map((s) => ({ label: s.label, items: s.items.map(keep).filter((x): x is NavItem => !!x) }))
    .filter((s) => s.items.length > 0);
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireUser();
  const r = s.user.roles;
  const sections: Section[] = [
    { items: [{ href: "/app", label: "Dashboard", icon: "dashboard" }] },
    {
      label: "Client work",
      items: [
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
      ],
    },
    {
      label: "Suspicious activity",
      items: [
        { href: "/app/cases", label: "Cases", icon: "cases", show: can(r, "case.view") },
        { href: "/app/reports", label: "FIU reports", icon: "report", show: can(r, "case.view") },
      ],
    },
    {
      label: "Firm compliance",
      items: [
        { href: "/app/firm", label: "Overview", icon: "firm", exact: true },
        {
          href: "/app/firm/risk-assessment", label: "Risk & policies", icon: "risk",
          children: [
            { href: "/app/firm/risk-assessment", label: "Risk assessment", icon: "risk" },
            { href: "/app/firm/policies", label: "Policies & procedures", icon: "policies" },
          ],
        },
        {
          href: "/app/firm/governance", label: "People & governance", icon: "people",
          children: [
            { href: "/app/firm/governance", label: "Governance", icon: "governance" },
            { href: "/app/firm/training", label: "Training", icon: "training" },
            { href: "/app/firm/integrity", label: "Integrity checks", icon: "integrity" },
          ],
        },
        {
          href: "/app/firm/whistleblowing", label: "Safeguards", icon: "safeguards",
          children: [
            { href: "/app/firm/whistleblowing", label: "Whistleblowing", icon: "whistle" },
            { href: "/app/firm/outsourcing", label: "Outsourcing", icon: "outsourcing" },
            { href: "/app/firm/privacy", label: "Privacy", icon: "privacy" },
          ],
        },
      ],
    },
    {
      label: "Administration",
      items: [
        { href: "/app/team", label: "Team", icon: "team" },
        { href: "/app/billing", label: "Billing", icon: "billing", show: can(r, "approve.compliance") },
        {
          href: "/app/settings/country-profile", label: "Screening setup", icon: "settings",
          children: [
            { href: "/app/settings/country-profile", label: "Country Profile", icon: "country", show: can(r, "countryProfile.view") },
            { href: "/app/settings/screening-lists", label: "Screening lists", icon: "screening", show: can(r, "countryProfile.view") },
          ],
        },
        {
          href: "/app/security", label: "Audit & retention", icon: "records",
          children: [
            { href: "/app/security", label: "Security log", icon: "security", show: can(r, "securityLog.view") },
            { href: "/app/records", label: "Records & retention", icon: "records", show: can(r, "records.purge") },
          ],
        },
      ],
    },
  ];
  const nav = visible(sections);
  const footerNav: NavItem[] = [
    { href: "/app/support", label: "Help & support", icon: "help" },
    { href: "/app/feature-requests", label: "Feature requests", icon: "ideas" },
    ...(isPlatformAdmin(s.user.email) ? [{ href: "/adminpage1&", label: "Backoffice", icon: "settings" }] : []),
  ];

  return (
    <AppShell
      nav={nav}
      footerNav={footerNav}
      firmName={s.firm.name}
      banner={s.firm.status === "cancelled" ? <>Subscription ended — read-only archive{s.firm.archiveUntil ? ` until ${s.firm.archiveUntil}` : ""}. <a className="underline" href="/app/billing">Download your full export</a></> : s.firm.status === "paused" || s.firm.status === "suspended" ? <>New checks and screenings are {s.firm.status} for your firm. Your records stay available. Questions: <Link className="underline" href="/app/support">Help &amp; support</Link></> : undefined}
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
