import Link from "next/link";
import { requireUser } from "@/lib/server/session";
import { CONTACT_EMAIL } from "@/lib/billing/plans";

export default async function Archived() {
  const s = await requireUser();
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl">Read-only archive</h1>
      {s.firm.status === "cancelled" ? (
        <>
          <p>Your subscription has ended. Your records are kept read-only{s.firm.archiveUntil ? ` until ${s.firm.archiveUntil}` : ""}, as anti-money-laundering law requires, and then deleted.</p>
          <p>You can still open every client file and download your full export from <Link className="text-accent underline" href="/app/billing">Billing</Link>. Nothing can be changed.</p>
          <p className="text-sm text-muted">To restart your subscription, write to {CONTACT_EMAIL}.</p>
        </>
      ) : (
        <p>Your subscription is active.</p>
      )}
    </div>
  );
}
