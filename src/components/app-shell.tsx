"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  LayoutDashboard, Users, Briefcase, CalendarClock, ShieldAlert, Building2, Settings, Lightbulb, ChevronDown, Menu, X,
  UserPlus, List, Upload, FilePlus2, FileText, Scale, BookOpen, GraduationCap, BadgeCheck, Megaphone, Handshake, Lock,
  Globe2, ListChecks, UsersRound, CreditCard, ScrollText, Archive, type LucideIcon,
} from "lucide-react";
import { Logo } from "./logo";

const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard, clients: Users, matters: Briefcase, calendar: CalendarClock, cases: ShieldAlert, firm: Building2,
  settings: Settings, ideas: Lightbulb, add: UserPlus, list: List, upload: Upload, newMatter: FilePlus2, report: FileText,
  risk: Scale, policies: BookOpen, training: GraduationCap, integrity: BadgeCheck, whistle: Megaphone, outsourcing: Handshake,
  privacy: Lock, country: Globe2, screening: ListChecks, team: UsersRound, billing: CreditCard, security: ScrollText, records: Archive,
};

export interface NavItem { href: string; label: string; icon: string; children?: NavItem[] }

function isActive(path: string, href: string) {
  return href === "/app" ? path === "/app" : path === href || path.startsWith(href + "/");
}

function Item({ item, path, onNavigate }: { item: NavItem; path: string; onNavigate: () => void }) {
  const Icon = ICONS[item.icon] ?? List;
  const childActive = item.children?.some((c) => isActive(path, c.href)) ?? false;
  const [open, setOpen] = useState(childActive || isActive(path, item.href));
  useEffect(() => { if (childActive) setOpen(true); }, [childActive]);
  const active = isActive(path, item.href) && !childActive;
  const base = "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition";
  const tone = (on: boolean) => (on ? "bg-white/10 font-semibold text-white shadow-[inset_3px_0_0_var(--brand)]" : "text-white/75 hover:bg-white/5 hover:text-white");
  if (!item.children?.length) {
    return (
      <li>
        <Link href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={`${base} ${tone(active)}`}>
          <Icon aria-hidden className="h-4 w-4 shrink-0" />
          {item.label}
        </Link>
      </li>
    );
  }
  return (
    <li>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className={`${base} ${tone(childActive && !open)}`}>
        <Icon aria-hidden className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left">{item.label}</span>
        <ChevronDown aria-hidden className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul className="mt-1 space-y-0.5 border-l border-white/10 pl-3 ml-5">
          {item.children.map((c) => {
            const CIcon = ICONS[c.icon] ?? List;
            const on = isActive(path, c.href) && !item.children!.some((o) => o.href !== c.href && o.href.startsWith(c.href + "/") && isActive(path, o.href));
            return (
              <li key={c.href}>
                <Link href={c.href} onClick={onNavigate} aria-current={on ? "page" : undefined} className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[0.85rem] ${on ? "bg-white/10 font-semibold text-white" : "text-white/65 hover:bg-white/5 hover:text-white"}`}>
                  <CIcon aria-hidden className="h-3.5 w-3.5 shrink-0" />
                  {c.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

/** App frame: left sidebar (drawer on phones) with grouped navigation, top bar, content. */
export function AppShell({ nav, topRight, firmName, banner, children }: { nav: NavItem[]; topRight: ReactNode; firmName: string; banner?: ReactNode; children: ReactNode }) {
  const path = usePathname();
  const [drawer, setDrawer] = useState(false);
  useEffect(() => setDrawer(false), [path]);
  const sidebar = (
    <div className="flex h-full flex-col bg-navy px-3 py-4">
      <div className="flex items-center justify-between px-2 pb-4">
        <Logo href="/app" />
        <button type="button" className="rounded p-1 text-white/80 lg:hidden" onClick={() => setDrawer(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
      </div>
      <p className="mb-3 truncate px-3 text-xs uppercase tracking-wider text-white/60" title={firmName}>{firmName}</p>
      <nav aria-label="Main" className="flex-1 overflow-y-auto">
        <ul className="space-y-1">
          {nav.map((n) => <Item key={n.href} item={n} path={path} onNavigate={() => setDrawer(false)} />)}
        </ul>
      </nav>
    </div>
  );
  return (
    <div className="min-h-screen lg:pl-64">
      <a href="#content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-background focus:px-3 focus:py-2">Skip to content</a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{sidebar}</aside>
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" className="absolute inset-0 bg-black/50" aria-label="Close menu" onClick={() => setDrawer(false)} />
          <aside className="relative h-full w-72 max-w-[85vw]">{sidebar}</aside>
        </div>
      )}
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/90 px-4 py-2.5 backdrop-blur">
        <button type="button" className="rounded p-1.5 lg:hidden" onClick={() => setDrawer(true)} aria-label="Open menu" aria-expanded={drawer}><Menu className="h-5 w-5" /></button>
        <span className="lg:hidden"><Logo href="/app" dark={false} /></span>
        <div className="ml-auto flex items-center gap-3 text-sm">{topRight}</div>
      </header>
      {banner && <div role="status" className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">{banner}</div>}
      <main id="content" className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
