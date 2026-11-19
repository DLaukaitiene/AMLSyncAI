"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Tabs across the top of grouped pages (as in ClearAML's Compliance Hub, Team and Settings). */
const GROUPS: { label: string; tabs: { href: string; label: string }[] }[] = [
  {
    label: "Compliance Hub",
    tabs: [
      { href: "/app/firm", label: "Overview" },
      { href: "/app/calendar", label: "Compliance Calendar" },
      { href: "/app/firm/risk-assessment", label: "Business Risk Assessment" },
      { href: "/app/firm/policies", label: "AML Program" },
      { href: "/app/firm/governance", label: "Governance" },
      { href: "/app/firm/outsourcing", label: "Outsourcing" },
      { href: "/app/firm/whistleblowing", label: "Whistleblowing" },
      { href: "/app/firm/privacy", label: "Data Protection" },
    ],
  },
  { label: "Team", tabs: [{ href: "/app/team", label: "Members" }, { href: "/app/firm/integrity", label: "Personnel Due Diligence" }, { href: "/app/firm/training", label: "Training" }] },
  {
    label: "Settings",
    tabs: [
      { href: "/app/settings/country-profile", label: "Country Profile" },
      { href: "/app/settings/screening-lists", label: "Screening Lists" },
      { href: "/app/billing", label: "Billing" },
      { href: "/app/security", label: "Security" },
      { href: "/app/records", label: "Records & Retention" },
    ],
  },
  { label: "FIU Reporting", tabs: [{ href: "/app/cases", label: "Suspicious Matters" }, { href: "/app/reports", label: "Report Queue" }] },
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
