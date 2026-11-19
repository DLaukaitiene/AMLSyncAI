"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  LayoutDashboard, Users, Briefcase, CalendarClock, ShieldAlert, Building2, Settings, Lightbulb, ChevronDown, ChevronRight, Menu, X,
  UserPlus, List, Upload, FilePlus2, FileText, Scale, BookOpen, GraduationCap, BadgeCheck, Megaphone, Handshake, Lock,
  Globe2, ListChecks, UsersRound, CreditCard, ScrollText, Archive, LifeBuoy, PanelLeftClose, PanelLeftOpen, ShieldCheck, Landmark,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "./logo";

const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard, clients: Users, matters: Briefcase, calendar: CalendarClock, cases: ShieldAlert, firm: Building2,
  settings: Settings, ideas: Lightbulb, add: UserPlus, list: List, upload: Upload, newMatter: FilePlus2, report: FileText,
  risk: Scale, policies: BookOpen, training: GraduationCap, integrity: BadgeCheck, whistle: Megaphone, outsourcing: Handshake,
  privacy: Lock, country: Globe2, screening: ListChecks, team: UsersRound, billing: CreditCard, security: ScrollText, records: Archive,
  help: LifeBuoy, people: UsersRound, safeguards: ShieldCheck, governance: Landmark,
};

/** One menu entry. With `children` it is a collapsible subsection. `exact`: active only on that exact path. */
export interface NavItem { href: string; label: string; icon: string; exact?: boolean; children?: NavItem[] }
/** A labelled group of entries in the sidebar ("Client work", "Firm compliance", ...). */
export interface NavSection { label?: string; items: NavItem[] }

function matches(path: string, item: NavItem) {
  if (item.exact || item.href === "/app") return path === item.href;
  return path === item.href || path.startsWith(item.href + "/");
}

/** The single most specific leaf for the current path (longest matching href), with its parents. */
function findTrail(sections: NavSection[], path: string) {
  let best: { section?: string; parent?: NavItem; leaf: NavItem } | null = null;
  const consider = (leaf: NavItem, section?: string, parent?: NavItem) => {
    if (matches(path, leaf) && (!best || leaf.href.length > best.leaf.href.length)) best = { section, parent, leaf };
  };
  for (const s of sections) for (const i of s.items) {
    if (i.children?.length) for (const c of i.children) consider(c, s.label, i);
    else consider(i, s.label);
  }
  return best as { section?: string; parent?: NavItem; leaf: NavItem } | null;
}

const COLLAPSE_KEY = "amlsync.sidebar.collapsed";

function Leaf({ item, active, onNavigate, nested, rail }: { item: NavItem; active: boolean; onNavigate: () => void; nested?: boolean; rail?: boolean }) {
  const Icon = ICONS[item.icon] ?? List;
  return (
    <li>
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        title={rail ? item.label : undefined}
        className={`flex items-center gap-3 rounded-lg transition ${rail ? "justify-center p-2.5" : nested ? "px-2.5 py-1.5 text-[0.85rem]" : "px-3 py-1.5 text-sm"} ${
          active ? "bg-white/10 font-semibold text-white shadow-[inset_3px_0_0_var(--brand)]" : nested ? "text-white/65 hover:bg-white/5 hover:text-white" : "text-white/80 hover:bg-white/5 hover:text-white"
        }`}
      >
        <Icon aria-hidden className={nested ? "h-3.5 w-3.5 shrink-0" : "h-4 w-4 shrink-0"} />
        {rail ? <span className="sr-only">{item.label}</span> : <span className="truncate">{item.label}</span>}
      </Link>
    </li>
  );
}

function Group({ item, activeHref, onNavigate, rail }: { item: NavItem; activeHref?: string; onNavigate: () => void; rail: boolean }) {
  const Icon = ICONS[item.icon] ?? List;
  const children = item.children ?? [];
  const containsActive = children.some((c) => c.href === activeHref);
  const [open, setOpen] = useState(containsActive);
  useEffect(() => { if (containsActive) setOpen(true); }, [containsActive]);
  if (rail) {
    // Icon-only rail: the subsection goes straight to its first page.
    return <Leaf item={{ ...item, href: children[0]?.href ?? item.href }} active={containsActive} onNavigate={onNavigate} rail />;
  }
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={`flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-sm transition ${containsActive && !open ? "bg-white/10 font-semibold text-white" : "text-white/80 hover:bg-white/5 hover:text-white"}`}
      >
        <Icon aria-hidden className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate text-left">{item.label}</span>
        <ChevronDown aria-hidden className={`h-4 w-4 shrink-0 opacity-70 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul className="ml-5 mt-0.5 space-y-0.5 border-l border-white/10 pl-2.5">
          {children.map((c) => <Leaf key={c.href} item={c} active={c.href === activeHref} onNavigate={onNavigate} nested />)}
        </ul>
      )}
    </li>
  );
}

function Sections({ sections, activeHref, onNavigate, rail }: { sections: NavSection[]; activeHref?: string; onNavigate: () => void; rail: boolean }) {
  return (
    <div className="space-y-3">
      {sections.map((s, i) => (
        <div key={s.label ?? i}>
          {s.label && (rail
            ? <div aria-hidden className="mx-2 mb-2 border-t border-white/10" />
            : <p className="mb-0.5 px-3 text-[0.7rem] font-semibold uppercase tracking-wider text-white/60">{s.label}</p>)}
          <ul className="space-y-0.5" aria-label={s.label}>
            {s.items.map((item) => item.children?.length
              ? <Group key={item.label} item={item} activeHref={activeHref} onNavigate={onNavigate} rail={rail} />
              : <Leaf key={item.href} item={item} active={item.href === activeHref} onNavigate={onNavigate} rail={rail} />)}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** App frame: left sidebar grouped into sections and subsections (drawer on phones, icon rail when collapsed), breadcrumb top bar, content. */
export function AppShell({ nav, footerNav, topRight, firmName, banner, children }: {
  nav: NavSection[]; footerNav?: NavItem[]; topRight: ReactNode; firmName: string; banner?: ReactNode; children: ReactNode;
}) {
  const path = usePathname();
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => setDrawer(false), [path]);
  useEffect(() => { try { setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1"); } catch { /* storage unavailable */ } }, []);
  const toggleCollapsed = () => {
    setCollapsed((c) => { try { localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1"); } catch { /* ignore */ } return !c; });
  };
  const all = useMemo(() => [...nav, ...(footerNav?.length ? [{ items: footerNav }] : [])], [nav, footerNav]);
  const trail = findTrail(all, path);
  const activeHref = trail?.leaf.href;
  const initials = firmName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");

  const sidebar = (rail: boolean, inDrawer: boolean) => (
    <div className="flex h-full flex-col bg-navy py-3">
      <div className={`flex items-center pb-3 ${rail ? "justify-center px-2" : "justify-between px-5"}`}>
        {rail ? <Link href="/app" className="text-lg font-bold text-white" aria-label="Dashboard">A<span className="text-[var(--brand)]">S</span></Link> : <Logo href="/app" />}
        {inDrawer && <button type="button" className="rounded p-1 text-white/80" onClick={() => setDrawer(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>}
      </div>
      <div className={`mb-3 flex items-center gap-2.5 ${rail ? "justify-center px-2" : "mx-3 rounded-xl bg-white/5 px-3 py-2"}`} title={firmName}>
        <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--brand)] text-xs font-bold text-navy">{initials || "·"}</span>
        {!rail && (
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-white">{firmName}</span>
            <span className="block text-[0.7rem] text-white/60">Your firm</span>
          </span>
        )}
      </div>
      <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col">
        <div className={`min-h-0 flex-1 overflow-y-auto pb-2 ${rail ? "px-2" : "px-3"}`}>
          <Sections sections={nav} activeHref={activeHref} onNavigate={() => setDrawer(false)} rail={rail} />
        </div>
        {footerNav?.length ? (
          <ul className={`shrink-0 space-y-0.5 border-t border-white/10 pt-2 ${rail ? "px-2" : "px-3"}`} aria-label="Help">
            {footerNav.map((item) => <Leaf key={item.href} item={item} active={item.href === activeHref} onNavigate={() => setDrawer(false)} rail={rail} />)}
          </ul>
        ) : null}
      </nav>
      {!inDrawer && (
        <div className={`mt-2 border-t border-white/10 pt-2 ${rail ? "px-2" : "px-3"}`}>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={rail ? "Expand menu" : "Collapse menu"}
            title={rail ? "Expand menu" : "Collapse menu"}
            className={`flex w-full items-center gap-3 rounded-lg py-1.5 text-sm text-white/60 transition hover:bg-white/5 hover:text-white ${rail ? "justify-center" : "px-3"}`}
          >
            {rail ? <PanelLeftOpen aria-hidden className="h-4 w-4" /> : <><PanelLeftClose aria-hidden className="h-4 w-4" /><span aria-hidden>Collapse menu</span></>}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className={`min-h-screen transition-[padding] ${collapsed ? "lg:pl-16" : "lg:pl-64"}`}>
      <a href="#content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-background focus:px-3 focus:py-2">Skip to content</a>
      <aside className={`fixed inset-y-0 left-0 z-30 hidden lg:block ${collapsed ? "w-16" : "w-64"}`}>{sidebar(collapsed, false)}</aside>
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" className="absolute inset-0 bg-black/50" aria-label="Close menu" onClick={() => setDrawer(false)} />
          <aside className="relative h-full w-72 max-w-[85vw]">{sidebar(false, true)}</aside>
        </div>
      )}
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/90 px-4 py-2.5 backdrop-blur sm:px-6">
        <button type="button" className="rounded p-1.5 lg:hidden" onClick={() => setDrawer(true)} aria-label="Open menu" aria-expanded={drawer}><Menu className="h-5 w-5" /></button>
        <span className="lg:hidden"><Logo href="/app" dark={false} /></span>
        {trail && (
          <nav aria-label="Breadcrumb" className="hidden min-w-0 lg:block">
            <ol className="flex items-center gap-1.5 text-sm text-muted">
              {trail.section && <li className="truncate">{trail.section}</li>}
              {trail.parent && (
                <>
                  {trail.section && <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0" />}
                  <li className="truncate">{trail.parent.label}</li>
                </>
              )}
              {(trail.section || trail.parent) && <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0" />}
              <li className="truncate">
                {path === trail.leaf.href
                  ? <span aria-current="page" className="font-medium text-foreground">{trail.leaf.label}</span>
                  : <Link href={trail.leaf.href} className="hover:text-foreground hover:underline">{trail.leaf.label}</Link>}
              </li>
            </ol>
          </nav>
        )}
        <div className="ml-auto flex items-center gap-3 text-sm">{topRight}</div>
      </header>
      {banner && <div role="status" className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">{banner}</div>}
      <main id="content" className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
