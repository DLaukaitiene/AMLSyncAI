import type { Metadata } from "next";
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
      <body className="antialiased min-h-screen">{children}</body>
    </html>
  );
}
