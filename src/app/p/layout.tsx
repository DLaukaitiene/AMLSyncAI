import type { Metadata } from "next";
import { Lock } from "lucide-react";

export const metadata: Metadata = { title: "Client information", robots: { index: false, follow: false } };

/** Client portal frame: calm, trustworthy, phone-first. */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-white/5 bg-navy">
        <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-3">
          <span className="font-[family-name:var(--font-heading)] text-lg font-extrabold tracking-tight text-white">AML<span className="text-brand">SYNC</span></span>
          <span className="inline-flex items-center gap-1.5 text-xs text-white/75"><Lock aria-hidden className="h-3.5 w-3.5" /> Secure page</span>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 py-6 sm:py-8">{children}</main>
      <footer className="mx-auto max-w-xl px-4 pb-8 text-center text-xs text-muted">Secured by AMLSync App · data stored in the EU</footer>
    </div>
  );
}
