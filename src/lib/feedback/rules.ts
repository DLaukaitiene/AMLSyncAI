/**
 * Feature request rules (spec §4.10, §11.13).
 */
import { normalizeName } from "@/lib/screening/match";

export const MAX_REQUESTS_PER_DAY = 10;
export const STATUSES = ["RECEIVED", "UNDER_REVIEW", "PLANNED", "IN_PROGRESS", "RELEASED", "NOT_PLANNED"] as const;
export type Status = (typeof STATUSES)[number];
export const STATUS_LABELS: Record<Status, string> = {
  RECEIVED: "Received", UNDER_REVIEW: "Under review", PLANNED: "Planned", IN_PROGRESS: "In progress", RELEASED: "Released", NOT_PLANNED: "Not planned",
};

const STOP = new Set(["a", "an", "the", "to", "of", "for", "and", "or", "in", "on", "with", "add", "please", "be", "able", "can", "we", "i", "it", "is", "should", "would", "like", "option", "feature"]);

function tokens(s: string): Set<string> {
  return new Set(normalizeName(s).split(" ").filter((t) => t.length > 2 && !STOP.has(t)).map((t) => t.replace(/(ing|es|s)$/, "")));
}

/** Similarity of two titles (0..1), word overlap after normalisation and light stemming. */
export function titleSimilarity(a: string, b: string): number {
  const x = tokens(a);
  const y = tokens(b);
  if (!x.size || !y.size) return 0;
  let inter = 0;
  for (const t of x) if (y.has(t)) inter++;
  return inter / Math.min(x.size, y.size);
}

export function similarRequests<T extends { title: string }>(title: string, existing: T[], limit = 5): T[] {
  return existing
    .map((e) => ({ e, s: titleSimilarity(title, e.title) }))
    .filter((x) => x.s >= 0.34)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.e);
}

const BLOCKED = ["viagra", "casino bonus", "crypto giveaway", "click here", "fuck", "shit", "cunt", "bitch", "asshole"];

/** Basic profanity / spam filter. Returns a reason when the text should be refused. */
export function spamReason(text: string): string | null {
  const t = text.toLowerCase();
  if (BLOCKED.some((w) => t.includes(w))) return "Please keep requests professional.";
  if ((t.match(/https?:\/\//g) ?? []).length > 2) return "Too many links.";
  if (/(.)\1{9,}/.test(t)) return "Please write the request in plain words.";
  return null;
}

/** Status-change rules: "Not planned" needs a reason, "Released" a release-note link. */
export function statusChangeProblem(status: Status, reason?: string, releaseNoteUrl?: string): string | null {
  if (status === "NOT_PLANNED" && (!reason || reason.trim().length < 10)) return "Give a reason when a request is not planned.";
  if (status === "RELEASED" && !/^https:\/\/\S+$/.test(releaseNoteUrl ?? "")) return "Add the release-note link (https://…).";
  return null;
}

/** Module pre-filled from the screen the user was on. */
export function moduleFromPath(path: string): string {
  const map: [RegExp, string][] = [
    [/^\/app\/clients/, "Clients and CDD"], [/^\/app\/matters/, "Matters"], [/^\/app\/remediation/, "Back-book"], [/^\/app\/calendar/, "Compliance Calendar"],
    [/^\/app\/cases|^\/app\/reports/, "Reporting"], [/^\/app\/firm\/risk/, "Firm risk assessment"], [/^\/app\/firm\/policies/, "Policy Builder"], [/^\/app\/firm/, "Firm and governance"],
    [/^\/app\/settings\/country/, "Country Profile"], [/^\/app\/settings\/screening/, "Screening"], [/^\/app\/team|^\/app\/security/, "Users and security"], [/^\/app\/records/, "Records"],
  ];
  return map.find(([re]) => re.test(path))?.[1] ?? "General";
}
