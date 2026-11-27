import type { Metadata } from "next";
import { headers } from "next/headers";
import "@fontsource-variable/inter";
import "@fontsource-variable/manrope";
import "./globals.css";
import { HelpAutoClose } from "@/components/help-auto-close";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "https://app.amlsync.com"),
  title: "AMLSync App",
  description: "AML compliance software for accountants, lawyers, estate agents and dealers under the EU AML Regulation (EU) 2024/1624: client checks, screening, transaction monitoring and FIU reporting.",
  openGraph: { siteName: "AMLSync App", type: "website", locale: "en_GB" },
  robots: { index: true, follow: true },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Read the request headers so every page renders per request and Next.js
  // applies the CSP nonce from middleware to its scripts.
  await headers();
  return (
    <html lang="en">
      <body className="antialiased min-h-screen">{children}<HelpAutoClose /></body>
    </html>
  );
}
