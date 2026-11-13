import { PublicHeader } from "@/components/public-header";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PublicHeader />
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </>
  );
}
