"use client";

import { ActionForm, Submit, type ActionState } from "./form";
import { StepUpLink } from "./step-up";

/** A single button bound to a server action (with its error and step-up link). */
export function ActionButton({
  action,
  children,
  variant = "secondary",
}: {
  action: () => Promise<ActionState>;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger";
}) {
  return (
    <ActionForm action={async () => action()} className="inline-flex flex-col items-end gap-1">
      <Submit variant={variant}>{children}</Submit>
      <StepUpLink />
    </ActionForm>
  );
}
