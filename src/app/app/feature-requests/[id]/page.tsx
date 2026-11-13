import { notFound } from "next/navigation";
import { requireUser } from "@/lib/server/session";
import { getRequest, isPlatformAdmin } from "@/lib/server/feedback";
import { STATUS_LABELS, type Status } from "@/lib/feedback/rules";
import { ActionButton } from "@/components/action-button";
import { hideCommentAction, voteAction } from "../actions";
import { CommentForm } from "./comment-form";

export default async function FeatureRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireUser();
  const team = isPlatformAdmin(s.user.email);
  const r = await getRequest(s, id, team);
  if (!r) notFound();
  return (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-1">
        <p className="text-sm text-muted">{r.module} · {STATUS_LABELS[r.status as Status]} · {r._count.votes} vote(s){r.regulatory ? " · regulatory" : ""}</p>
        <h1 className="text-2xl font-semibold">{r.title}</h1>
      </div>
      <p className="whitespace-pre-wrap text-sm">{r.problem}</p>
      <p className="text-sm text-muted">How often: {r.frequency || "—"} · Importance: {r.importance}{r.legalReference ? ` · Legal reference: ${r.legalReference}` : ""}</p>
      {r.statusReason && <p className="text-sm">Note from the AMLSyncAI team: {r.statusReason}</p>}
      {r.releaseNoteUrl && <p className="text-sm">Released: <a className="text-accent underline" href={r.releaseNoteUrl}>release note</a></p>}
      {r.voted ? <p className="text-sm">You voted for this.</p> : <ActionButton action={voteAction.bind(null, r.id)} variant="primary">Vote for this</ActionButton>}
      <section className="space-y-2">
        <h2 className="font-semibold">Status history</h2>
        <ul className="text-sm text-muted">{r.history.map((h, i) => <li key={i}>{h.createdAt.toISOString().slice(0, 10)} · {STATUS_LABELS[h.status as Status]}{h.note ? ` — ${h.note}` : ""}</li>)}</ul>
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">Comments</h2>
        <ul className="space-y-2 text-sm">
          {r.comments.map((c) => (
            <li key={c.id} className={`rounded border border-border p-2 ${c.hidden ? "opacity-50" : ""}`}>
              <span className="text-muted">{c.author} · {c.createdAt.toISOString().slice(0, 10)}</span>
              <p className="whitespace-pre-wrap">{c.text}</p>
              {team && !c.hidden && <ActionButton action={hideCommentAction.bind(null, c.id, r.id)}>Hide</ActionButton>}
            </li>
          ))}
        </ul>
        <CommentForm id={r.id} team={team} />
      </section>
    </div>
  );
}
