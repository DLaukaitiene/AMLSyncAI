import "server-only";
import type { z } from "zod";
import type { ActionState } from "@/components/form";

export function formToObject(fd: FormData): Record<string, string> {
  const o: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") o[k] = v;
  return o;
}

export function zodErrors(err: z.ZodError): ActionState {
  const fieldErrors: Record<string, string[]> = {};
  for (const i of err.issues) (fieldErrors[i.path.join(".")] ??= []).push(i.message);
  return { error: "Check the highlighted fields.", fieldErrors };
}

/** Bot heuristic: honeypot filled in. */
export const isBot = (fd: FormData) => typeof fd.get("website") === "string" && (fd.get("website") as string).length > 0;

/** Only allow redirects to paths inside the app. */
export function safeNext(next: unknown, fallback = "/app"): string {
  return typeof next === "string" && /^\/app(\/[\w\-/?=&%.]*)?$/.test(next) ? next : fallback;
}
