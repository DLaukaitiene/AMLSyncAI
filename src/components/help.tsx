import { CircleHelp } from "lucide-react";

/**
 * The app's one way to explain things [24 Nov 2026]: a (?) that opens a short note on demand,
 * so pages show what to do and the explanations stay out of the way. Works without JavaScript.
 */
export function Help({ children, label = "What is this?", align = "left" }: { children: React.ReactNode; label?: string; align?: "left" | "right" }) {
  return (
    <details className="relative inline-block align-middle" data-testid="help">
      <summary aria-label={label} title={label} className="inline-flex cursor-pointer list-none rounded-full text-accent marker:hidden hover:brightness-110 focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
        <CircleHelp aria-hidden className="h-5 w-5" />
      </summary>
      <div className={`absolute z-30 mt-2 w-[min(26rem,85vw)] space-y-1.5 whitespace-normal rounded-xl border border-border bg-background p-3 text-left text-sm font-normal leading-relaxed text-muted shadow-[var(--shadow)] ${align === "right" ? "right-0" : "left-0"}`}>
        {children}
      </div>
    </details>
  );
}

/** Page title with its explanation behind a (?). */
export function PageTitle({ children, help, className = "text-3xl" }: { children: React.ReactNode; help?: React.ReactNode; className?: string }) {
  return (
    <div className="flex items-center gap-2">
      <h1 className={className}>{children}</h1>
      {help ? <Help label="About this page">{help}</Help> : null}
    </div>
  );
}
