"use client";

import { ActionForm, Field, Submit, type ActionState } from "@/components/form";
import { commentAction } from "../actions";

export function CommentForm({ id, team }: { id: string; team: boolean }) {
  return (
    <ActionForm
      action={commentAction.bind(null, id)}
      render={(st: ActionState) => (st?.data as { pii?: boolean } | undefined)?.pii ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="confirmNoClientData" /> I confirm this is not client data</label> : null}
    >
      <Field label="Add a comment" name="text" />
      {team && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="asTeam" defaultChecked /> Post as AMLSyncAI team</label>}
      <Submit variant="secondary">Comment</Submit>
    </ActionForm>
  );
}
