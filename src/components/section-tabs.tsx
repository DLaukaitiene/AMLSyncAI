"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Tabs across the top of grouped pages (as in ClearAML's Compliance Hub, Team and Settings). */
const GROUPS: { label: string; tabs: { href: string; label: string }[] }[] = [
  {
    label: "Clients",
    tabs: [
      { href: "/app/clients", label: "All Clients" },
      { href: "/app/identity-verification", label: "Identity Checks" },
      { href: "/app/risk-assessments", label: "Risk Ratings" },
      { href: "/app/remediation", label: "Import Clients" },
      { href: "/app/clients/shared", label: "Shared Files" },
      { href: "/app/tools/ownership-calculator", label: "Ownership Calculator" },
    ],
  },
  { label: "Cases & Payments", tabs: [{ href: "/app/matters", label: "Cases" }, { href: "/app/transactions", label: "Transactions" }, { href: "/app/transactions/import", label: "Import Transactions" }] },
  { label: "Reporting", tabs: [{ href: "/app/cases", label: "Investigations" }, { href: "/app/reports", label: "Report Queue" }, { href: "/app/registers", label: "Registers & Exports" }] },
  {
    label: "Compliance Hub",
    tabs: [
      { href: "/app/firm", label: "Overview" },
      { href: "/app/obligations", label: "My Obligations" },
      { href: "/app/calendar", label: "Calendar" },
      { href: "/app/firm/risk-assessment", label: "Business Risk Assessment" },
      { href: "/app/firm/policies", label: "AML Program" },
      { href: "/app/firm/governance", label: "Governance" },
      { href: "/app/firm/outsourcing", label: "Outsourcing" },
      { href: "/app/firm/whistleblowing", label: "Whistleblowing" },
      { href: "/app/firm/privacy", label: "Data Protection" },
      { href: "/app/firm/documents", label: "Firm Documents" },
      { href: "/app/firm/review-pack", label: "Review Pack" },
      { href: "/app/audit-trail", label: "Audit Trail" },
    ],
  },
  { label: "Team", tabs: [{ href: "/app/team", label: "Members" }, { href: "/app/firm/training", label: "My Training" }, { href: "/app/team/training-register", label: "Training Register" }, { href: "/app/team/responsibilities", label: "Responsibilities" }, { href: "/app/firm/integrity", label: "Staff Checks" }] },
  {
    label: "Settings",
    tabs: [
      { href: "/app/settings/country-profile", label: "Country Profile" },
      { href: "/app/settings/transaction-monitoring", label: "Transaction Monitoring" },
      { href: "/app/settings/screening-lists", label: "Screening Lists" },
      { href: "/app/billing", label: "Billing" },
      { href: "/app/security", label: "Security" },
      { href: "/app/settings/email", label: "Email Settings" },
      { href: "/app/records", label: "Records & Retention" },
    ],
  },
  { label: "Help", tabs: [{ href: "/app/support", label: "Help Centre" }, { href: "/app/feature-requests", label: "Feature Requests" }] },
];

export function SectionTabs({ allowed }: { allowed: string[] }) {
  const path = usePathname();
  const group = GROUPS.find((g) => g.tabs.some((t) => t.href === path));
  if (!group) return null;
  const tabs = group.tabs.filter((t) => allowed.includes(t.href));
  if (tabs.length < 2) return null;
  return (
    <nav aria-label={`${group.label} sections`} className="-mt-2 mb-6 overflow-x-auto border-b border-border">
      <ul className="flex min-w-max gap-1">
        {tabs.map((t) => (
          <li key={t.href}>
            <Link href={t.href} aria-current={path === t.href ? "page" : undefined}
              className={`-mb-px inline-block border-b-2 px-3 py-2 text-sm ${path === t.href ? "border-accent font-semibold text-foreground" : "border-transparent text-muted hover:text-foreground"}`}>{t.label}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
