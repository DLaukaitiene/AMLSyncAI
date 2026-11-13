/**
 * Generated documents (risk assessment, policies, annual report, supervisor
 * file) share one structure, rendered as a web page and as PDF.
 */
export type Block =
  | { p: string }
  | { list: string[] }
  | { kv: [string, string][] }
  | { table: { head: string[]; rows: string[][] } };

export interface DocSection {
  id: string;
  heading: string;
  blocks: Block[];
  /** Marked on approval screens (spec §11.12): AI-written text must be reviewed. */
  aiDrafted?: boolean;
}

export interface GeneratedDoc {
  title: string;
  subtitle?: string;
  meta: string[]; // version, dates, rule-set versions
  sections: DocSection[];
}
