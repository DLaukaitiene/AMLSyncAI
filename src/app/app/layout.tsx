import Link from "next/link";
import { requireUser } from "@/lib/server/session";
import { can, ROLE_LABELS } from "@/lib/auth/permissions";
import { logoutAction } from "@/app/(auth)/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireUser();
  const r = s.user.roles;
  const nav = [
    { href: "/app", label: "Dashboard", show: true },
    { href: "/app/clients", label: "Clients", show: can(r, "client.view") },
    { href: "/app/matters", label: "Matters", show: can(r, "client.view") },
    { href: "/app/calendar", label: "Calendar", show: true },
    { href: "/app/settings/country-profile", label: "Country Profile", show: can(r, "countryProfile.view") },
    { href: "/app/settings/screening-lists", label: "Screening lists", show: can(r, "countryProfile.view") },
    { href: "/app/team", label: "Team", show: true },
    { href: "/app/records", label: "Records", show: can(r, "records.purge") },
    { href: "/app/security", label: "Security log", show: can(r, "securityLog.view") },
  ].filter((n) => n.show);
  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-sm">
          <Link href="/app" className="font-semibold">AMLSyncAI</Link>
          <span className="text-muted">{s.firm.name}</span>
          <form action={logoutAction} className="ml-auto flex items-center gap-3">
            <span className="text-muted" title={r.map((x) => ROLE_LABELS[x]).join(", ")}>
              {s.user.name}
              {s.user.external && <span className="ml-1 rounded border border-border px-1 text-xs">external</span>}
            </span>
            <button type="submit" className="text-muted underline hover:text-foreground">Sign out</button>
          </form>
        </div>
        <nav aria-label="Main" className="mx-auto flex max-w-6xl gap-4 overflow-x-auto px-4 pb-2 text-sm">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="whitespace-nowrap text-muted hover:text-foreground">
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </>
  );
}
