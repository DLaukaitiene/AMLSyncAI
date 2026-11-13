"use client";

import { ActionForm, Field, Submit, type ActionState } from "@/components/form";
import { importAction } from "./actions";

export function ImportForm() {
  return (
    <ActionForm
      action={importAction}
      render={(s: ActionState) => {
        const errors = (s?.data as { errors?: { line: number; message: string }[] } | undefined)?.errors;
        return errors ? <ul className="text-sm text-red-700 dark:text-red-300">{errors.map((e) => <li key={e.line}>Line {e.line}: {e.message}</li>)}</ul> : null;
      }}
    >
      <Field label="CSV file" name="file">
        <input type="file" name="file" accept=".csv,text/csv" aria-label="CSV file" className="text-sm" />
      </Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="skipErrors" /> Import the valid rows and skip the others</label>
      <Submit>Import</Submit>
    </ActionForm>
  );
}
