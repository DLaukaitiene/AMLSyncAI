import Link from "next/link";

/** Wordmark in the amlsync.com style: "AML" + cyan "Sync" + "AI". */
export function Logo({ href = "/", tagline = true, dark = true }: { href?: string; tagline?: boolean; dark?: boolean }) {
  return (
    <Link href={href} className="flex flex-col leading-none hover:no-underline">
      <span className={`font-[family-name:var(--font-heading)] text-xl font-extrabold tracking-tight ${dark ? "text-white" : "text-foreground"}`}>
        AML<span className="text-brand">Sync</span>AI
      </span>
      {tagline && <span className={`mt-1 text-[0.62rem] uppercase tracking-[0.14em] ${dark ? "text-white/60" : "text-muted"}`}>AMLR compliance</span>}
    </Link>
  );
}
