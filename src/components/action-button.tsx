"use client";

import { ActionForm, Submit, type ActionState } from "./form";
import { StepUpLink } from "./step-up";

/**
 * Messages under a single button float just below it, so the button and the page around it never move
 * when a success, error or confirm message appears [28 Nov 2026].
 */
const FLOAT = "relative inline-block [&>[role=alert]]:absolute [&>[role=alert]]:left-0 [&>[role=alert]]:top-full [&>[role=alert]]:z-20 [&>[role=alert]]:mt-1 [&>[role=alert]]:w-max [&>[role=alert]]:max-w-sm [&>[role=alert]]:shadow-[var(--shadow)] [&>[role=status]]:absolute [&>[role=status]]:left-0 [&>[role=status]]:top-full [&>[role=status]]:z-20 [&>[role=status]]:mt-1 [&>[role=status]]:w-max [&>[role=status]]:max-w-sm [&>[role=status]]:shadow-[var(--shadow)] [&>[role=alertdialog]]:absolute [&>[role=alertdialog]]:left-0 [&>[role=alertdialog]]:top-full [&>[role=alertdialog]]:z-20 [&>[role=alertdialog]]:mt-1 [&>[role=alertdialog]]:w-max [&>[role=alertdialog]]:max-w-sm [&>[role=alertdialog]]:shadow-[var(--shadow)]";

/** A single button bound to a server action. */
export function ActionButton({
  action,
  children,
  variant = "secondary",
}: {
  action: (fd?: FormData) => Promise<ActionState>; // gets the form data so it can ask to confirm (confirmed=yes)
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger";
}) {
  return (
    <ActionForm action={async (_s, fd) => action(fd)} className={FLOAT}>
      <Submit variant={variant}>{children}</Submit>
      <StepUpLink />
    </ActionForm>
  );
}
