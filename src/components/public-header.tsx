import Link from "next/link";
import { Logo } from "./logo";

/** Public header in the amlsync.com style: navy bar, white links, cyan pill button. */
export function PublicHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-white/5 bg-navy/95 backdrop-blur">
      <nav aria-label="Main" className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-sm sm:px-6">
        <Logo href="/" />
        <Link href="/pricing" className="text-white/80 hover:text-white">Pricing</Link>
        <Link href="/tools/beneficial-ownership" className="text-white/80 hover:text-white">BO calculator</Link>
        <Link href="/security" className="hidden text-white/80 hover:text-white sm:inline">Security</Link>
        <span className="ml-auto flex items-center gap-4">
          <Link href="/login" className="text-white/80 hover:text-white">Sign in</Link>
          <Link href="/signup" className="rounded-full bg-brand px-4 py-2 font-semibold text-brand-ink hover:brightness-105">Start free trial</Link>
        </span>
      </nav>
    </header>
  );
}
