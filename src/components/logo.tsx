import Link from "next/link";

/** Company logo (same as amlsync.com): "AML" + cyan "SYNC", "Compliance Services" underneath. */
export function Logo({ href = "/", tagline = true, dark = true }: { href?: string; tagline?: boolean; dark?: boolean }) {
  return (
    <Link href={href} className="flex flex-col leading-none hover:no-underline">
      <span className={`font-[family-name:var(--font-heading)] text-xl font-extrabold tracking-tight ${dark ? "text-white" : "text-foreground"}`}>
        AML<span className={dark ? "text-brand" : "text-accent"}>SYNC</span>
      </span>
      {tagline && <span className={`mt-1 text-[0.62rem] uppercase tracking-[0.14em] ${dark ? "text-white/60" : "text-muted"}`}>Compliance Services</span>}
    </Link>
  );
}
