import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: "AMLSyncAI",
  description: "AML compliance for EU non-financial obliged entities under AMLR (EU) 2024/1624.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Read the request headers so every page renders per request and Next.js
  // applies the CSP nonce from middleware to its scripts.
  await headers();
  return (
    <html lang="en">
      <body className="antialiased min-h-screen">
        <header className="border-b border-border">
          <nav className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3 text-sm">
            <Link href="/" className="font-semibold">AMLSyncAI</Link>
            <Link href="/tools/beneficial-ownership" className="text-muted hover:text-foreground">BO calculator</Link>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
