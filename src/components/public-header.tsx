import Link from "next/link";
import { Menu } from "lucide-react";
import { Logo } from "./logo";

/** Main menu of the public pages. Consulting is AMLSync's outsourcing site. */
export const PUBLIC_NAV: { href: string; label: string; external?: boolean }[] = [
  { href: "/product", label: "AMLSync App" },
  { href: "/amlr-guide", label: "AMLR 2027 Guide" },
  { href: "/pricing", label: "Pricing" },
  { href: "https://amlsync.com", label: "Consulting", external: true },
  { href: "/contact", label: "Contact" },
];

const link = "text-white/80 hover:text-white";

function NavLink({ href, label, external, className = link }: (typeof PUBLIC_NAV)[number] & { className?: string }) {
  return external ? <a href={href} className={className}>{label}</a> : <Link href={href} className={className}>{label}</Link>;
}

/**
 * Public header in the amlsync.com style: navy bar, white links, cyan pill button.
 * On sign-in and sign-up pages ("auth") only the logo and the other door show:
 * people there came to do one thing.
 */
export function PublicHeader({ variant = "site" }: { variant?: "site" | "auth" }) {
  if (variant === "auth") {
    return (
      <header className="border-b border-white/5 bg-navy">
        <nav aria-label="Main" className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 text-sm sm:px-6">
          <Logo href="/" />
          <span className="ml-auto flex items-center gap-4">
            <Link href="/login" className={link}>Sign in</Link>
            <Link href="/signup" className="rounded-full border border-white/30 px-4 py-1.5 text-white hover:border-white">Sign up</Link>
          </span>
        </nav>
      </header>
    );
  }
  return (
    <header className="sticky top-0 z-20 border-b border-white/5 bg-navy/95 backdrop-blur">
      <nav aria-label="Main" className="mx-auto flex max-w-6xl items-center gap-x-6 px-4 py-3 text-sm sm:px-6">
        <Logo href="/" />
        <span className="hidden items-center gap-x-6 lg:flex">
          {PUBLIC_NAV.map((n) => <NavLink key={n.href} {...n} />)}
        </span>
        <span className="ml-auto flex items-center gap-4">
          <Link href="/login" className={`${link} hidden sm:inline`}>Sign in</Link>
          <Link href="/contact?topic=demo" className="hidden rounded-full border border-white/30 px-4 py-2 font-semibold text-white hover:border-white md:inline-block">Book a demo</Link>
          <Link href="/signup" className="rounded-full bg-brand px-4 py-2 font-semibold text-brand-ink hover:brightness-105">Start free trial</Link>
          {/* Small screens: the menu folds into a disclosure (no JavaScript needed). */}
          <details className="relative lg:hidden">
            <summary className="flex cursor-pointer list-none items-center rounded-full p-2 text-white hover:bg-white/10 [&::-webkit-details-marker]:hidden">
              <Menu aria-hidden className="h-5 w-5" />
              <span className="sr-only">Menu</span>
            </summary>
            <div className="absolute right-0 mt-2 flex w-56 flex-col rounded-2xl bg-navy p-2 shadow-xl ring-1 ring-white/10">
              {PUBLIC_NAV.map((n) => <NavLink key={n.href} {...n} className={`${link} rounded-lg px-3 py-2 hover:bg-white/10`} />)}
              <Link href="/contact?topic=demo" className={`${link} rounded-lg px-3 py-2 hover:bg-white/10 md:hidden`}>Book a demo</Link>
              <Link href="/login" className={`${link} rounded-lg px-3 py-2 hover:bg-white/10 sm:hidden`}>Sign in</Link>
            </div>
          </details>
        </span>
      </nav>
    </header>
  );
}
