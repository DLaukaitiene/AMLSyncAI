"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/form";
import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { can } from "@/lib/auth/permissions";
import { raiseFromTransaction, reviewTransaction, type ReviewAction } from "@/lib/server/transactions";
import { addTransactionAction } from "../matters/actions";
import { parseTransactionCsv } from "@/lib/transactions/import";

/** Log Transaction from the monitoring page: the select carries "matterId:partyId". */
export async function logTransactionAction(prev: ActionState, fd: FormData): Promise<ActionState> {
  const [matterId, partyId] = String(fd.get("link") ?? "").split(":");
  if (!matterId || !partyId) return { error: "Choose the client and case.", fieldErrors: { link: ["Required."] } };
  fd.set("customerId", partyId);
  const r = await addTransactionAction(matterId, prev, fd);
  revalidatePath("/app/transactions");
  return r;
}

export async function reviewTransactionAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("client.edit");
  const action = String(fd.get("action") ?? "");
  const note = String(fd.get("note") ?? "").trim();
  const ctx = { firmId: s.firm.id, userId: s.user.id };
  if (note.length < 20) return { error: "Write a reason of at least 20 characters. It is kept for the supervisor.", fieldErrors: { note: ["At least 20 characters."] } };
  try {
    if (action === "raise") {
      if (!can(s.user.roles, "case.raise")) return { error: "You can't raise internal reports." };
      await withTenant(s.firm.id, (tx) => raiseFromTransaction(tx, ctx, id, note));
      revalidatePath("/app/transactions");
      return { message: "Internal suspicion report sent to the Compliance Officer. The transaction is marked Investigated. Don't tell the client (Art. 73)." };
    }
    if (!["clear", "investigate", "flag"].includes(action)) return { error: "Choose what to do." };
    if (action !== "flag" && !can(s.user.roles, "approve.compliance")) return { error: "Only the Owner or Compliance Officer can clear or investigate a transaction. You can flag it for their review." };
    await withTenant(s.firm.id, (tx) => reviewTransaction(tx, ctx, id, action as ReviewAction, note));
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath("/app/transactions");
  return { message: action === "clear" ? "Marked as cleared." : action === "investigate" ? "Marked as investigated." : "Flagged for review." };
}

export async function thresholdsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("approve.compliance");
  const cash = Math.round(Number(fd.get("cash")));
  const high = Math.round(Number(fd.get("high")));
  if (!(cash >= 100 && cash <= 10_000)) return { error: "Cash threshold: between €100 and €10,000 (the EU cash limit).", fieldErrors: { cash: ["€100–€10,000"] } };
  if (!(high >= 1_000)) return { error: "High-value threshold: at least €1,000.", fieldErrors: { high: ["At least €1,000"] } };
  await withTenant(s.firm.id, async (tx) => {
    await tx.firm.update({ where: { id: s.firm.id }, data: { txCashThresholdEUR: cash, txHighValueThresholdEUR: high } });
    await audit(tx, { firmId: s.firm.id, userId: s.user.id, action: "update", objectType: "Firm", objectId: s.firm.id, fields: ["txCashThresholdEUR", "txHighValueThresholdEUR"] });
  });
  revalidatePath("/app/transactions");
  return { message: "Thresholds saved. They apply to transactions recorded from now on." };
}

/**
 * Imports payments from a CSV. Each row is matched to an open matter by its title
 * and to the payer among that matter's parties by name, then recorded exactly like
 * a payment entered by hand (CDD triggers, cash limit, red flags).
 */
export async function importTransactionsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("client.edit");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file." };
  if (file.size > 2_000_000) return { error: "The file is too large (2 MB at most)." };
  const { rows, errors } = parseTransactionCsv(await file.text(), 200);
  const links = await withTenant(s.firm.id, (tx) => tx.matterParty.findMany({ where: { matter: { status: { not: "COMPLETED" } } }, include: { party: { select: { displayName: true } }, matter: { select: { title: true } } } }));
  const norm = (x: string) => x.trim().toLowerCase().replace(/\s+/g, " ");
  let imported = 0, flagged = 0;
  const problems = [...errors];
  for (const r of rows) {
    const onMatter = links.filter((l) => norm(l.matter.title) === norm(r.matter));
    if (!onMatter.length) { problems.push({ line: r.line, error: `No open case called "${r.matter}".` }); continue; }
    const payer = onMatter.filter((l) => norm(l.party.displayName) === norm(r.client));
    if (payer.length !== 1) { problems.push({ line: r.line, error: payer.length ? `"${r.client}" is on more than one open case called "${r.matter}".` : `"${r.client}" is not a party to "${r.matter}".` }); continue; }
    const f = new FormData();
    f.set("customerId", payer[0].partyId); f.set("date", r.date); f.set("amountEUR", String(r.amountEUR));
    f.set("method", r.method.startsWith("other: ") ? "other" : r.method);
    if (r.method.startsWith("other: ")) f.set("methodOther", r.method.slice(7));
    f.set("description", r.description); f.set("fromCountry", r.fromCountry);
    if (r.thirdParty) f.set("thirdPartyPayer", "on");
    const res = await addTransactionAction(payer[0].matterId, null, f);
    if (res && "error" in res && res.error) { problems.push({ line: r.line, error: res.error }); continue; }
    imported++;
    if (res && "message" in res && /Flagged for review/.test(String(res.message))) flagged++;
  }
  revalidatePath("/app/transactions");
  const summary = `${imported} transaction(s) imported${flagged ? `, ${flagged} flagged for review` : ""}.`;
  if (!problems.length) return { message: summary };
  problems.sort((a, b) => a.line - b.line);
  return { message: `${summary} ${problems.length} row(s) not imported: ${problems.slice(0, 10).map((p) => `line ${p.line}: ${p.error}`).join(" · ")}${problems.length > 10 ? " …" : ""}` };
}
