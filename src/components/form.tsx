"use client";

import { createContext, startTransition, useActionState, useContext, useId, type ReactNode } from "react";

export type ActionState = { error?: string; fieldErrors?: Record<string, string[]>; message?: string; data?: unknown } | null;
export type FormAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

const Ctx = createContext<ActionState>(null);
const PendingCtx = createContext(false);

/** A form bound to a server action; shows the action's error and per-field errors. */
export function ActionForm({
  action,
  children,
  className,
  render,
}: {
  action: FormAction;
  children?: ReactNode;
  className?: string;
  render?: (state: ActionState) => ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <Ctx.Provider value={state}>
     <PendingCtx.Provider value={pending}>
      <form
        action={formAction}
        // Submit through a transition instead of the form action so React 19
        // doesn't clear what the user typed when the server returns an error.
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(() => formAction(fd));
        }}
        className={className ?? "space-y-4"}
        noValidate
      >
        {state?.error && (
          <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
            {state.error}
          </p>
        )}
        {state?.message && (
          <p role="status" className="rounded border border-border px-3 py-2 text-sm">
            {state.message}
          </p>
        )}
        {children}
        {render?.(state)}
      </form>
     </PendingCtx.Provider>
    </Ctx.Provider>
  );
}

export function useActionResult() {
  return useContext(Ctx);
}

export function Field({
  label,
  name,
  type = "text",
  hint,
  defaultValue,
  required,
  autoComplete,
  inputMode,
  children,
}: {
  label: string;
  name: string;
  type?: string;
  hint?: ReactNode;
  defaultValue?: string | number;
  required?: boolean;
  autoComplete?: string;
  inputMode?: "numeric" | "text" | "email" | "decimal";
  children?: ReactNode;
}) {
  const id = useId();
  const state = useContext(Ctx);
  const errors = state?.fieldErrors?.[name];
  const describedBy = [hint ? `${id}-hint` : null, errors ? `${id}-err` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
        {required && <span aria-hidden="true" className="text-muted"> *</span>}
      </label>
      {children ? (
        <div id={id}>{children}</div>
      ) : (
        <input
          id={id}
          name={name}
          type={type}
          defaultValue={defaultValue}
          required={required}
          autoComplete={autoComplete}
          inputMode={inputMode}
          aria-invalid={errors ? true : undefined}
          aria-describedby={describedBy}
          className="w-full rounded border border-border bg-transparent px-3 py-2 text-sm focus:outline-2 focus:outline-accent"
        />
      )}
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {errors?.map((e) => (
        <p key={e} id={`${id}-err`} className="text-xs text-red-700 dark:text-red-300">
          {e}
        </p>
      ))}
    </div>
  );
}

export function Submit({ children, variant = "primary" }: { children: ReactNode; variant?: "primary" | "secondary" | "danger" }) {
  const pending = useContext(PendingCtx);
  const styles = {
    primary: "bg-accent text-white dark:text-black",
    secondary: "border border-border",
    danger: "bg-red-700 text-white",
  }[variant];
  return (
    <button type="submit" disabled={pending} className={`rounded px-4 py-2 text-sm font-medium disabled:opacity-60 ${styles}`}>
      {pending ? "Working…" : children}
    </button>
  );
}

/** Invisible field that real users never fill in; bots often do (spec §8C.4). */
export function Honeypot() {
  return (
    <div aria-hidden="true" className="absolute -left-[10000px] h-0 w-0 overflow-hidden">
      <label>
        Website
        <input type="text" name="website" tabIndex={-1} autoComplete="off" />
      </label>
    </div>
  );
}
