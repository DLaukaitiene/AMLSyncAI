"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { FeatureRequestStatus } from "@prisma/client";
import type { ActionState } from "@/components/form";
import { requireUser, hasRecentMfa } from "@/lib/server/session";
import { comment, createRequest, hideComment, hideRequest, isPlatformAdmin, merge, setStatus, vote } from "@/lib/server/feedback";
import { STATUSES } from "@/lib/feedback/rules";

const g = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function createRequestAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser();
  if (g(fd, "title").length < 5) return { error: "Give the request a short title.", fieldErrors: { title: ["At least 5 characters."] } };
  if (g(fd, "problem").length < 10) return { error: "Describe the problem it solves.", fieldErrors: { problem: ["At least 10 characters."] } };
  if (!["nice-to-have", "important", "blocking"].includes(g(fd, "importance"))) return { error: "Choose how important it is." };
  const regulatory = fd.get("regulatory") === "on";
  if (regulatory && g(fd, "legalReference").length < 3) return { error: "Give the legal reference.", fieldErrors: { legalReference: ["e.g. national AML law art. 15"] } };
  const r = await createRequest(s, {
    title: g(fd, "title").slice(0, 150), problem: g(fd, "problem").slice(0, 3000), frequency: g(fd, "frequency"), importance: g(fd, "importance"),
    module: g(fd, "module") || "General", regulatory, legalReference: g(fd, "legalReference"), confirmNoClientData: fd.get("confirmNoClientData") === "on",
  });
  if (!r.ok) return { error: r.error, data: { pii: r.pii } };
  redirect(`/app/feature-requests/${r.id}`);
}

export async function voteAction(id: string): Promise<ActionState> {
  const s = await requireUser();
  const r = await vote(s, id);
  revalidatePath(`/app/feature-requests/${id}`);
  return r.ok ? { message: "Vote added." } : { error: r.error };
}

export async function commentAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser();
  const team = isPlatformAdmin(s.user.email) && fd.get("asTeam") === "on";
  const r = await comment(s, id, g(fd, "text"), fd.get("confirmNoClientData") === "on", team);
  if (!r.ok) return { error: r.error, data: { pii: r.pii } };
  revalidatePath(`/app/feature-requests/${id}`);
  return { message: "Comment added." };
}

// ---- AMLSyncAI team ----------------------------------------------------------

async function requireTeam() {
  const s = await requireUser();
  if (!isPlatformAdmin(s.user.email)) redirect("/app");
  return s;
}

export async function statusAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireTeam();
  if (!hasRecentMfa(s)) return { error: "For security, confirm it's you first.", data: { stepUp: "/admin/feature-requests" } };
  const status = g(fd, "status") as FeatureRequestStatus;
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) return { error: "Choose a status." };
  const r = await setStatus(s.user.email, id, status, g(fd, "reason"), g(fd, "releaseNoteUrl"));
  revalidatePath("/admin/feature-requests");
  return r.ok ? { message: `Status updated; ${r.notified} person(s) notified.` } : { error: r.error };
}

export async function mergeAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireTeam();
  const r = await merge(s.user.email, id, g(fd, "targetId"));
  revalidatePath("/admin/feature-requests");
  return r.ok ? { message: "Merged; votes combined." } : { error: r.error };
}

export async function hideAction(id: string, hidden: boolean): Promise<ActionState> {
  await requireTeam();
  await hideRequest(id, hidden);
  revalidatePath("/admin/feature-requests");
  return { message: hidden ? "Hidden." : "Visible again." };
}

export async function hideCommentAction(commentId: string, requestId: string): Promise<ActionState> {
  await requireTeam();
  await hideComment(commentId);
  revalidatePath(`/app/feature-requests/${requestId}`);
  return { message: "Comment hidden." };
}
