import Link from "next/link";

/** Wordmark as on amlsync.com: "AML" + cyan "Sync", with "App" underneath. */
export function Logo({ href = "/", tagline = true, dark = true }: { href?: string; tagline?: boolean; dark?: boolean }) {
  return (
    <Link href={href} className="flex flex-col leading-none hover:no-underline">
      <span className={`font-[family-name:var(--font-heading)] text-xl font-extrabold tracking-tight ${dark ? "text-white" : "text-foreground"}`}>
        AML<span className="text-brand">Sync</span>{!tagline && <span className="ml-1 font-semibold opacity-70">App</span>}
      </span>
      {tagline && <span className={`mt-1 text-[0.62rem] uppercase tracking-[0.14em] ${dark ? "text-white/60" : "text-muted"}`}>App · AMLR compliance</span>}
    </Link>
  );
}
