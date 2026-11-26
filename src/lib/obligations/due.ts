/** "Next review in 42 days" / "due today" / "overdue by 3 days", with a tone for colouring. */
export type DueTone = "overdue" | "soon" | "later";

export function daysBetween(due: Date, now: Date): number {
  const d = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  const n = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((d - n) / 86_400_000);
}

export function dueText(what: string, due: Date | null | undefined, now = new Date()): { text: string; tone: DueTone } | null {
  if (!due) return null;
  const days = daysBetween(due, now);
  const date = due.toISOString().slice(0, 10);
  if (days < 0) return { text: `${what} overdue by ${-days} day${days === -1 ? "" : "s"} (was due ${date})`, tone: "overdue" };
  if (days === 0) return { text: `${what} due today`, tone: "overdue" };
  if (days === 1) return { text: `${what} due tomorrow`, tone: "soon" };
  return { text: `${what} in ${days} days (${date})`, tone: days <= 30 ? "soon" : "later" };
}

/** Earliest of several dates (nulls ignored). */
export const earliest = (ds: (Date | null | undefined)[]): Date | null =>
  ds.filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
