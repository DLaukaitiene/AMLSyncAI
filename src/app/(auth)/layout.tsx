import { PublicHeader } from "@/components/public-header";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PublicHeader variant="auth" />
      <main className="min-h-[calc(100vh-64px)] bg-surface px-4 py-10">
        <div className="mx-auto max-w-md rounded-2xl border border-border bg-background p-6 shadow-[var(--shadow)] sm:p-8">{children}</div>
      </main>
    </>
  );
}
