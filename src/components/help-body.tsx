import type { ReactNode } from "react";

/** Renders help article markup: "## " headings, "1. " steps, "- " bullets, "> " tips, plain paragraphs. */
export function HelpBody({ body }: { body: string }) {
  const out: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    out.push(<Tag key={out.length} className={`${list.ordered ? "list-decimal" : "list-disc"} space-y-1 pl-6`}>{list.items.map((t, i) => <li key={i}>{t}</li>)}</Tag>);
    list = null;
  };
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    const num = line.match(/^\d+\.\s+(.*)$/);
    if (num || line.startsWith("- ")) {
      const ordered = !!num;
      if (list && list.ordered !== ordered) flush();
      list ??= { ordered, items: [] };
      list.items.push(num ? num[1] : line.slice(2));
      continue;
    }
    flush();
    if (!line) continue;
    if (line.startsWith("## ")) out.push(<h2 key={out.length} className="pt-2 text-lg font-semibold">{line.slice(3)}</h2>);
    else if (line.startsWith("> ")) out.push(<p key={out.length} className="rounded-xl border border-accent/40 bg-brand/10 px-4 py-3 text-sm"><strong>Tip: </strong>{line.slice(2)}</p>);
    else out.push(<p key={out.length}>{line}</p>);
  }
  flush();
  return <div className="space-y-3 text-[0.95rem] leading-relaxed">{out}</div>;
}
