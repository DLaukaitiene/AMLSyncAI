import Link from "next/link";
import { PublicHeader } from "@/components/public-header";
import { SELLER } from "@/lib/billing/invoice";
import { CONTACT_EMAIL } from "@/lib/billing/plans";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PublicHeader />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">{children}</main>
      <footer className="mt-10 bg-navy text-sm text-white/65">
        <div className="mx-auto flex max-w-6xl flex-wrap gap-x-8 gap-y-2 px-4 py-8 sm:px-6">
          <span>© {new Date().getFullYear()} {SELLER.name} · company code {SELLER.companyCode} · {SELLER.address}</span>
          <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-white">{CONTACT_EMAIL}</a>
          <Link href="/security" className="hover:text-white">Security</Link>
          <a href="https://amlsync.com" className="hover:text-white">amlsync.com</a>
        </div>
      </footer>
    </>
  );
}
