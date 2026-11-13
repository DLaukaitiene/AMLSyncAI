import type { Metadata } from "next";

export const metadata: Metadata = { title: "Client information", robots: { index: false, follow: false } };

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-xl px-4 py-8">{children}</main>;
}
