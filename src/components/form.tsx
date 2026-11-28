"use client";

import { createContext, startTransition, useActionState, useContext, useId, useRef, useState, type ReactNode } from "react";
import { CircleHelp } from "lucide-react";
import { countryName, countryOptions, normalizeCountries, normalizeCountry } from "@/lib/geo/countries";

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
  // Actions with consequences answer { data: { confirm: "what will happen" } } first: we show that warning and
  // send the same form again with confirmed=yes when the person confirms (no re-authentication anywhere) [28 Nov 2026].
  const last = useRef<FormData | null>(null);
  const [dismissed, setDismissed] = useState<ActionState>(null);
  const confirm = state && state !== dismissed ? (state.data as { confirm?: string } | undefined)?.confirm : undefined;
  return (
    <Ctx.Provider value={state}>
     <PendingCtx.Provider value={pending}>
      <form
        action={formAction}
        // Submit through a transition instead of the form action so React 19
        // doesn't clear what the user typed when the server returns an error.
        onSubmit={(e) => {
          e.preventDefault();
          // Include the clicked button's name/value (e.g. intent=save vs intent=submit).
          const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
          last.current = fd;
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
        {confirm && (
          <div role="alertdialog" aria-label="Please confirm" className="basis-full space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100" data-testid="confirm-box">
            <p>{confirm}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={pending} className="rounded-full bg-brand px-4 py-1.5 font-semibold text-brand-ink hover:brightness-105 disabled:opacity-60"
                onClick={() => {
                  const fd = new FormData();
                  for (const [k, v] of last.current?.entries() ?? []) fd.append(k, v);
                  fd.set("confirmed", "yes");
                  startTransition(() => formAction(fd));
                }}>{pending ? "Working…" : "Confirm"}</button>
              <button type="button" className="rounded-full border border-current/30 px-4 py-1.5" onClick={() => setDismissed(state)}>Cancel</button>
            </div>
          </div>
        )}
      </form>
     </PendingCtx.Provider>
    </Ctx.Provider>
  );
}

/** "?" button that shows or hides a field's grey hint. The hint stays in the page for screen readers. */
function HintButton({ open, onToggle, controls, label }: { open: boolean; onToggle: () => void; controls: string; label: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={controls}
      // Generic name on purpose: a name containing the field label would also match getByLabel(label).
      aria-label="Show help"
      title={`Help: ${label}`}
      className="ml-1.5 inline-flex items-center justify-center rounded-full align-middle text-accent hover:brightness-110"
    >
      <CircleHelp aria-hidden className="h-4 w-4" />
    </button>
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
  options,
  children,
}: {
  label: string;
  name: string;
  /** Suggestions shown as you type; any other text is still accepted. */
  options?: string[];
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
  const [hintOpen, setHintOpen] = useState(false);
  const errors = state?.fieldErrors?.[name];
  const describedBy = [hint ? `${id}-hint` : null, errors ? `${id}-err` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="space-y-1">
      <div className="flex items-center">
        <label htmlFor={id} className="block text-sm font-medium">
          {label}
          {required && <span aria-hidden="true" className="text-muted"> *</span>}
        </label>
        {hint && <HintButton open={hintOpen} onToggle={() => setHintOpen((o) => !o)} controls={`${id}-hint`} label={label} />}
      </div>
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
          list={options ? `${id}-options` : undefined}
          aria-invalid={errors ? true : undefined}
          aria-describedby={describedBy}
          className="w-full rounded border border-border bg-transparent px-3 py-2 text-sm focus:outline-2 focus:outline-accent"
        />
      )}
      {options && (
        <datalist id={`${id}-options`}>
          {options.map((o) => <option key={o} value={o} />)}
        </datalist>
      )}
      {hint && (
        <p id={`${id}-hint`} hidden={!hintOpen} className="text-xs text-muted">
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
    primary: "bg-brand text-brand-ink hover:brightness-105",
    secondary: "border border-border bg-background hover:border-accent",
    danger: "bg-red-700 text-white hover:bg-red-800",
  }[variant];
  return (
    <button type="submit" disabled={pending} className={`rounded-full px-5 py-2 text-sm font-semibold font-[family-name:var(--font-heading)] transition disabled:opacity-60 ${styles}`}>
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

/** Countries are shown by full name; the ISO code is what gets submitted. */
const label = (v: string) => (/^[A-Z]{2}$/.test(v) ? countryName(v) : v);

/**
 * Country picker for every country field: type to search all countries, or
 * type any other name ("Other"). `multiple` lets people add several (e.g.
 * nationalities). Submits ISO codes where recognised, otherwise the text.
 */
export function CountryField({
  label: text,
  name,
  hint,
  defaultValue,
  required,
  multiple,
  euFirst,
}: {
  label: string;
  name: string;
  hint?: ReactNode;
  defaultValue?: string | string[];
  required?: boolean;
  multiple?: boolean;
  euFirst?: boolean;
}) {
  const id = useId();
  const listId = `${id}-countries`;
  const state = useContext(Ctx);
  const errors = state?.fieldErrors?.[name];
  const initial = normalizeCountries(defaultValue ?? []);
  const [values, setValues] = useState<string[]>(initial);
  const [draft, setDraft] = useState(multiple ? "" : initial[0] ? label(initial[0]) : "");
  const [hintOpen, setHintOpen] = useState(false);
  const describedBy = [`${id}-hint`, errors ? `${id}-err` : null].filter(Boolean).join(" ");
  const add = () => {
    const v = normalizeCountry(draft);
    if (v && !values.includes(v)) setValues([...values, v]);
    setDraft("");
  };
  const cls = "w-full rounded border border-border bg-transparent px-3 py-2 text-sm focus:outline-2 focus:outline-accent";
  return (
    <div className="space-y-1">
      <div className="flex items-center">
        <label htmlFor={id} className="block text-sm font-medium">
          {text}
          {required && <span aria-hidden="true" className="text-muted"> *</span>}
        </label>
        <HintButton open={hintOpen} onToggle={() => setHintOpen((o) => !o)} controls={`${id}-hint`} label={text} />
      </div>
      <datalist id={listId}>
        {countryOptions(euFirst).map((c) => <option key={c.code} value={c.name} />)}
      </datalist>
      {multiple ? (
        <>
          {values.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label={`${text}: chosen`}>
              {values.map((v) => (
                <li key={v} className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-sm">
                  {label(v)}
                  <button type="button" className="text-muted hover:text-foreground" aria-label={`Remove ${label(v)}`} onClick={() => setValues(values.filter((x) => x !== v))}>×</button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <input
              id={id}
              list={listId}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }}
              aria-invalid={errors ? true : undefined}
              aria-describedby={describedBy}
              placeholder="Type a country"
              autoComplete="off"
              className={cls}
            />
            <button type="button" onClick={add} className="rounded border border-border px-3 text-sm whitespace-nowrap">Add country</button>
          </div>
          {/* A country typed but not yet added still counts. */}
          <input type="hidden" name={name} value={[...values, ...(normalizeCountry(draft) && !values.includes(normalizeCountry(draft)!) ? [normalizeCountry(draft)!] : [])].join(", ")} />
        </>
      ) : (
        <>
          <input
            id={id}
            list={listId}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            required={required}
            aria-invalid={errors ? true : undefined}
            aria-describedby={describedBy}
            placeholder="Type a country"
            autoComplete="off"
            className={cls}
          />
          <input type="hidden" name={name} value={normalizeCountry(draft) ?? ""} />
        </>
      )}
      <p id={`${id}-hint`} hidden={!hintOpen} className="text-xs text-muted">
        {hint ?? "Pick from the list, or type the name if it isn't listed."}
      </p>
      {errors?.map((e) => (
        <p key={e} id={`${id}-err`} className="text-xs text-red-700 dark:text-red-300">
          {e}
        </p>
      ))}
    </div>
  );
}

/**
 * A dropdown with an "Other" choice that opens a text box (`${name}Other`) to
 * describe it. Use for every list where real life can fall outside the options.
 */
export function SelectWithOther({
  label: text,
  name,
  options,
  otherValue = "OTHER",
  otherLabel = "Other (describe)",
  defaultValue,
  defaultOther,
  required,
  hint,
  placeholder,
}: {
  label: string;
  name: string;
  options: [string, string][];
  otherValue?: string;
  otherLabel?: string;
  defaultValue?: string;
  defaultOther?: string;
  required?: boolean;
  hint?: ReactNode;
  placeholder?: string;
}) {
  const id = useId();
  const state = useContext(Ctx);
  const errors = [...(state?.fieldErrors?.[name] ?? []), ...(state?.fieldErrors?.[`${name}Other`] ?? [])];
  const [value, setValue] = useState(defaultValue ?? "");
  const [hintOpen, setHintOpen] = useState(false);
  const cls = "w-full rounded border border-border bg-background px-3 py-2 text-sm";
  return (
    <div className="space-y-1">
      <div className="flex items-center">
        <label htmlFor={id} className="block text-sm font-medium">
          {text}
          {required && <span aria-hidden="true" className="text-muted"> *</span>}
        </label>
        {hint && <HintButton open={hintOpen} onToggle={() => setHintOpen((o) => !o)} controls={`${id}-hint`} label={text} />}
      </div>
      <select id={id} name={name} value={value} onChange={(e) => setValue(e.target.value)} required={required} className={cls} aria-invalid={errors.length ? true : undefined} aria-describedby={hint ? `${id}-hint` : undefined}>
        {placeholder !== undefined && <option value="" disabled={required}>{placeholder}</option>}
        {options.filter(([v]) => v !== otherValue).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        <option value={otherValue}>{otherLabel}</option>
      </select>
      {value === otherValue && (
        <input
          name={`${name}Other`}
          defaultValue={defaultOther}
          required
          maxLength={200}
          aria-label={`${text}: describe`}
          placeholder="Describe"
          className="w-full rounded border border-border bg-transparent px-3 py-2 text-sm focus:outline-2 focus:outline-accent"
        />
      )}
      {hint && <p id={`${id}-hint`} hidden={!hintOpen} className="text-xs text-muted">{hint}</p>}
      {errors.map((e) => <p key={e} className="text-xs text-red-700 dark:text-red-300">{e}</p>)}
    </div>
  );
}
