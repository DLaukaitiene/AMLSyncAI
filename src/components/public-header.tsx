import Link from "next/link";

export function PublicHeader() {
  return (
    <header className="border-b border-border">
      <nav className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3 text-sm">
        <Link href="/" className="font-semibold">AMLSyncAI</Link>
        <Link href="/tools/beneficial-ownership" className="text-muted hover:text-foreground">BO calculator</Link>
        <span className="ml-auto flex gap-4">
          <Link href="/login" className="text-muted hover:text-foreground">Sign in</Link>
          <Link href="/signup" className="text-accent">Sign up</Link>
        </span>
      </nav>
    </header>
  );
}
