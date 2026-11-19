"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { createPortalLink } from "@/lib/server/portal";
import { SCOPE_REASONS } from "@/lib/rules/cdd-scope";

const ids = (fd: FormData) => [...new Set(fd.getAll("id").map(String).filter((x) => /^[0-9a-f-]{36}$/i.test(x)))].slice(0, 100);
const done = (q: Record<string, string | number>) => redirect(`/app/clients?${new URLSearchParams(Object.entries(q).map(([k, v]) => [k, String(v)]))}`);

/** Sends the secure link to each selected client that is in progress, has an email and no open link. */
export async function bulkSendLinksAction(fd: FormData) {
  const s = await requireUser("client.edit");
  const list = ids(fd);
  if (!list.length) done({ bulk: "none" });
  let sent = 0, skipped = 0;
  await withTenant(s.firm.id, async (tx) => {
    const files = await tx.cddFile.findMany({ where: { id: { in: list }, role: "CLIENT" }, include: { party: true } });
    for (const f of files) {
      const email = String((f.party.details as { email?: string }).email ?? "").trim();
      const open = await tx.portalLink.count({ where: { cddFileId: f.id, status: { in: ["SENT", "OPENED"] }, expiresAt: { gt: new Date() } } });
      if (f.status !== "OPEN" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || open) { skipped++; continue; }
      await createPortalLink(tx, { firmId: s.firm.id, userId: s.user.id }, f.id, email);
      sent++;
    }
    skipped += list.length - files.length;
  }, { timeoutMs: 60_000 });
  done({ bulk: "links", sent, skipped });
}

/** Marks the selected clients identification only (service outside AMLR scope) — a Compliance Officer decision. */
export async function bulkIdOnlyAction(fd: FormData) {
  const s = await requireUser("gate.override");
  const list = ids(fd);
  const reason = String(fd.get("bulkScopeReason") ?? "");
  if (!list.length) done({ bulk: "none" });
  if (!SCOPE_REASONS[reason] || reason === "other" || reason === "firm-default") done({ bulk: "noreason" });
  let n = 0;
  await withTenant(s.firm.id, async (tx) => {
    const files = await tx.cddFile.findMany({ where: { id: { in: list }, role: "CLIENT", scope: "full", status: { notIn: ["REFUSED", "TERMINATED"] } } });
    for (const f of files) {
      await tx.cddFile.update({ where: { id: f.id }, data: { scope: "identification-only", scopeReason: reason, scopeNote: "Set in bulk from the client list", scopeSetById: s.user.id, scopeSetAt: new Date() } });
      await audit(tx, { firmId: s.firm.id, userId: s.user.id, action: "update", objectType: "CddFile", objectId: f.id, fields: ["scope"] });
      n++;
    }
  }, { timeoutMs: 60_000 });
  done({ bulk: "idonly", n });
}
