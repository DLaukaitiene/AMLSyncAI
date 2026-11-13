import type { Block, GeneratedDoc } from "@/lib/docs/model";

function B({ b }: { b: Block }) {
  if ("p" in b) return <p className="whitespace-pre-wrap">{b.p}</p>;
  if ("list" in b) return <ul className="list-disc space-y-1 pl-5">{b.list.map((x, i) => <li key={i}>{x}</li>)}</ul>;
  if ("kv" in b) return <dl className="grid grid-cols-[auto_1fr] gap-x-4">{b.kv.map(([k, v]) => <div key={k} className="contents"><dt className="text-muted">{k}</dt><dd>{v}</dd></div>)}</dl>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="text-left text-muted"><tr>{b.table.head.map((h) => <th key={h} className="py-1 pr-3 font-normal">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-border">{b.table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="py-1 pr-3 align-top">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

/** Web rendering of a generated document (same content as the PDF). */
export function DocView({ doc }: { doc: GeneratedDoc }) {
  return (
    <article className="space-y-6 text-sm">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">{doc.title}</h2>
        {doc.subtitle && <p>{doc.subtitle}</p>}
        {doc.meta.map((m) => <p key={m} className="text-xs text-muted">{m}</p>)}
      </header>
      {doc.sections.map((s) => (
        <section key={s.id} className="space-y-2">
          <h3 className="font-semibold">{s.heading}{s.aiDrafted && <span className="ml-2 rounded border border-amber-500 px-1 text-xs font-normal">AI-drafted — review</span>}</h3>
          {s.blocks.map((b, i) => <B key={i} b={b} />)}
        </section>
      ))}
    </article>
  );
}
