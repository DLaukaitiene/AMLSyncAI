import Link from "next/link";
import { requireUser } from "@/lib/server/session";
import { can } from "@/lib/auth/permissions";
import { ensureShareCode, listShares, SHARE_BASES } from "@/lib/server/sharing";
import { ActionButton } from "@/components/action-button";
import { acceptShareAction, declineShareAction, withdrawShareAction } from "./actions";

export const metadata = { title: "Shared Files" };

const STATUS: Record<string, string> = { pending: "waiting", importing: "being imported", accepted: "imported", declined: "declined", withdrawn: "withdrawn", expired: "expired" };
const d = (x: Date) => x.toISOString().slice(0, 10);

export default async function SharedFilesPage() {
  const s = await requireUser("client.view");
  const manage = can(s.user.roles, "approve.compliance");
  const [code, { incoming, outgoing }] = await Promise.all([ensureShareCode(s.firm.id), listShares(s.firm.id)]);
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl">Shared Files</h1>
        <p className="text-sm text-muted">Send a client&apos;s file to another firm that uses AMLSync App, or import a file another firm sent you, for example when a client moves to you or two firms work on the same deal. Only the Owner and Compliance Officer can send and import files.</p>
      </div>
      <section className="space-y-2 rounded-2xl border border-border p-4" data-testid="share-code">
        <h2 className="text-lg font-semibold">Your firm code</h2>
        <p className="font-mono text-2xl tracking-wider">{code}</p>
        <p className="text-sm text-muted">Give this code to a firm that wants to send you a client file. It only lets them send files to you; it doesn&apos;t give access to anything.</p>
      </section>
      <section className="space-y-3 rounded-2xl border border-border p-4">
        <h2 className="text-lg font-semibold">Received</h2>
        <p className="text-sm text-muted">Importing creates a new client file with the client&apos;s data, ownership structure, check summary and documents. Everyone is screened again under your account. Under Art. 48 AMLR you may rely on another firm&apos;s checks, but your firm stays responsible: review the file before you accept the client.</p>
        {incoming.length ? (
          <ul className="divide-y divide-border rounded-lg border border-border" data-testid="shares-in">
            {incoming.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm">
                <span>
                  <span className="font-medium">{x.clientName}</span> from {x.firm} · {d(x.createdAt)} · {x.documents} document(s) · {STATUS[x.status] ?? x.status}
                  {x.status === "pending" && <span className="text-muted"> · until {d(x.expiresAt)}</span>}
                  <span className="block text-xs text-muted">{SHARE_BASES[x.legalBasis] ?? x.legalBasis}{x.note ? ` · “${x.note}”` : ""}</span>
                </span>
                {x.status === "pending" && manage ? (
                  <span className="flex gap-2">
                    <ActionButton action={acceptShareAction.bind(null, x.id)} variant="primary">Import as a new client</ActionButton>
                    <ActionButton action={declineShareAction.bind(null, x.id)}>Decline</ActionButton>
                  </span>
                ) : x.importedFileId ? <Link className="underline" href={`/app/clients/${x.importedFileId}`}>Open client</Link> : null}
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted">Nothing received yet.</p>}
      </section>
      <section className="space-y-3 rounded-2xl border border-border p-4">
        <h2 className="text-lg font-semibold">Sent</h2>
        <p className="text-sm text-muted">To send a file, open the client and use <strong>Share with another firm</strong> on the Documents tab.</p>
        {outgoing.length ? (
          <ul className="divide-y divide-border rounded-lg border border-border" data-testid="shares-out">
            {outgoing.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm">
                <span><Link className="font-medium underline" href={`/app/clients/${x.sourceFileId}`}>{x.clientName}</Link> to {x.firm} · {d(x.createdAt)} · {STATUS[x.status] ?? x.status}{x.decidedAt ? ` ${d(x.decidedAt)}` : ""}</span>
                {x.status === "pending" && manage && <ActionButton action={withdrawShareAction.bind(null, x.id)}>Withdraw</ActionButton>}
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted">Nothing sent yet.</p>}
      </section>
    </div>
  );
}
