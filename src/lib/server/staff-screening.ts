import "server-only";
import type { Tx } from "./db";
import { audit } from "./audit";
import { loadLists } from "./cdd";
import { screenSubject } from "@/lib/screening/match";

/**
 * Staff screening (AMLR Art. 11/13 employee checks): each active colleague's
 * name against the sanctions and PEP lists already loaded in the app. Free —
 * no paid provider is called — and it doesn't count towards client limits.
 */
export async function screenStaff(tx: Tx, ctx: { firmId: string; userId: string }, userIds?: string[]) {
  const lists = await loadLists(tx);
  const users = await tx.user.findMany({ where: { deactivatedAt: null, ...(userIds ? { id: { in: userIds } } : {}) }, select: { id: true, name: true } });
  let possible = 0;
  for (const u of users) {
    const matches: { listName: string; matchedName: string; score: number; reference: string | null }[] = [];
    for (const list of lists) {
      const found = screenSubject(
        { name: u.name, entity: false, countries: [], otherNames: [] },
        list.entries.map((e) => ({ id: e.id, entityType: e.entityType as "person" | "entity", names: e.names, birthDates: e.birthDates, countries: e.countries })),
      );
      for (const m of found) {
        const entry = list.entries.find((e) => e.id === m.entryId);
        matches.push({ listName: list.name, matchedName: m.matchedName, score: Math.round(m.score * 100) / 100, reference: entry?.reference ?? null });
      }
    }
    if (matches.length) possible++;
    const row = await tx.staffScreening.create({
      data: { firmId: ctx.firmId, userId: u.id, listsChecked: lists.length, matches, status: matches.length ? "possible-match" : "clear", screenedById: ctx.userId },
    });
    await audit(tx, { firmId: ctx.firmId, userId: ctx.userId, action: "screen", objectType: "StaffScreening", objectId: row.id });
  }
  return { screened: users.length, possible, listsChecked: lists.length };
}

/** The Compliance Officer's decision on a possible match: a false positive, or a confirmed match. */
export async function reviewStaffScreening(tx: Tx, ctx: { firmId: string; userId: string }, id: string, outcome: "cleared" | "confirmed", note: string) {
  const row = await tx.staffScreening.findUniqueOrThrow({ where: { id } });
  if (row.status !== "possible-match") throw new Error("This result was already reviewed.");
  await tx.staffScreening.update({ where: { id }, data: { status: outcome, reviewNote: note, reviewedById: ctx.userId } });
  await audit(tx, { firmId: ctx.firmId, userId: ctx.userId, action: "approve", objectType: "StaffScreening", objectId: id, fields: ["status"] });
}

/** Latest result per active user. */
export async function latestStaffScreening(tx: Tx) {
  const rows = await tx.staffScreening.findMany({ orderBy: { screenedAt: "desc" }, take: 500 });
  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!latest.has(r.userId)) latest.set(r.userId, r);
  return latest;
}
