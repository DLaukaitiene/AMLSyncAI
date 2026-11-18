/** Small coloured status / risk badges used across lists and file headers. */
const TONE = {
  green: "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-200",
  amber: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  red: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200",
  blue: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200",
  grey: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
} as const;
export type Tone = keyof typeof TONE;

export function Chip({ tone, children, title }: { tone: Tone; children: React.ReactNode; title?: string }) {
  return <span title={title} className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${TONE[tone]}`}>{children}</span>;
}

export const STATUS_LABEL: Record<string, string> = { OPEN: "In progress", COMPLETE: "Accepted", SDD: "Accepted (SDD)", EDD: "Accepted (EDD)", REFUSED: "Refused", TERMINATED: "Ended" };
const STATUS_TONE: Record<string, Tone> = { OPEN: "amber", COMPLETE: "green", SDD: "green", EDD: "green", REFUSED: "red", TERMINATED: "grey" };

export function StatusChip({ status, ready }: { status: string; ready?: boolean }) {
  if (status === "OPEN" && ready) return <Chip tone="blue">Ready to decide</Chip>;
  return <Chip tone={STATUS_TONE[status] ?? "grey"}>{STATUS_LABEL[status] ?? status}</Chip>;
}

export function RiskChip({ level }: { level: string | null | undefined }) {
  if (!level) return <span className="text-muted">—</span>;
  const l = level.toUpperCase();
  return <Chip tone={l === "HIGH" ? "red" : l === "MEDIUM" ? "amber" : "green"}>{l === "HIGH" ? "High" : l === "MEDIUM" ? "Medium" : "Low"} risk</Chip>;
}
