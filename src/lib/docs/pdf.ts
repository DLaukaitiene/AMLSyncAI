import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { Block, GeneratedDoc } from "./model";

const FONT_DIR = path.join(process.cwd(), "node_modules", "dejavu-fonts-ttf", "ttf");
const A4 = { w: 595.28, h: 841.89 };
const M = 56;

/** Renders a generated document to PDF (A4, Unicode via DejaVu Sans), with an optional footer watermark. */
export async function renderPdf(doc: GeneratedDoc, opts: { watermark?: string } = {}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(doc.title);
  pdf.setProducer("AMLSyncAI");
  const regular = await pdf.embedFont(await readFile(path.join(FONT_DIR, "DejaVuSans.ttf")), { subset: true });
  const bold = await pdf.embedFont(await readFile(path.join(FONT_DIR, "DejaVuSans-Bold.ttf")), { subset: true });

  let page: PDFPage = pdf.addPage([A4.w, A4.h]);
  let y = A4.h - M;
  const width = A4.w - 2 * M;

  const newPage = () => {
    page = pdf.addPage([A4.w, A4.h]);
    y = A4.h - M;
  };
  const wrap = (text: string, font: PDFFont, size: number, maxW: number): string[] => {
    const out: string[] = [];
    for (const para of text.split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/)) {
        const tryLine = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(tryLine, size) <= maxW) line = tryLine;
        else {
          if (line) out.push(line);
          line = word;
          while (font.widthOfTextAtSize(line, size) > maxW && line.length > 1) {
            let cut = line.length - 1;
            while (cut > 1 && font.widthOfTextAtSize(line.slice(0, cut), size) > maxW) cut--;
            out.push(line.slice(0, cut));
            line = line.slice(cut);
          }
        }
      }
      out.push(line);
    }
    return out;
  };
  const write = (text: string, o: { font?: PDFFont; size?: number; indent?: number; gap?: number; color?: [number, number, number] } = {}) => {
    const font = o.font ?? regular;
    const size = o.size ?? 10;
    const lh = size * 1.4;
    for (const l of wrap(text, font, size, width - (o.indent ?? 0))) {
      if (y - lh < M) newPage();
      page.drawText(l, { x: M + (o.indent ?? 0), y: y - size, size, font, color: rgb(...(o.color ?? [0.1, 0.1, 0.12])) });
      y -= lh;
    }
    y -= o.gap ?? 4;
  };
  const block = (b: Block) => {
    if ("p" in b) write(b.p, { gap: 6 });
    else if ("list" in b) {
      for (const item of b.list) write(`•  ${item}`, { indent: 8, gap: 2 });
      y -= 4;
    } else if ("kv" in b) {
      for (const [k, v] of b.kv) write(`${k}: ${v}`, { gap: 2 });
      y -= 4;
    } else {
      const cols = b.table.head.length;
      const colW = width / cols;
      const row = (cells: string[], font: PDFFont) => {
        const wrapped = cells.map((c) => wrap(c ?? "", font, 9, colW - 6));
        const lines = Math.max(...wrapped.map((w) => w.length));
        if (y - lines * 12.6 < M) newPage();
        wrapped.forEach((w, i) => w.forEach((l, j) => page.drawText(l, { x: M + i * colW, y: y - 9 - j * 12.6, size: 9, font, color: rgb(0.1, 0.1, 0.12) })));
        y -= lines * 12.6 + 4;
        page.drawLine({ start: { x: M, y: y + 2 }, end: { x: M + width, y: y + 2 }, thickness: 0.3, color: rgb(0.8, 0.8, 0.82) });
      };
      row(b.table.head, bold);
      for (const r of b.table.rows) row(r, regular);
      y -= 6;
    }
  };

  write(doc.title, { font: bold, size: 18, gap: 4 });
  if (doc.subtitle) write(doc.subtitle, { size: 11, gap: 4 });
  for (const m of doc.meta) write(m, { size: 8.5, gap: 0, color: [0.4, 0.42, 0.46] });
  y -= 12;
  for (const s of doc.sections) {
    if (y < M + 80) newPage();
    write(s.heading + (s.aiDrafted ? "  (AI-drafted, reviewed)" : ""), { font: bold, size: 12.5, gap: 4 });
    for (const b of s.blocks) block(b);
    y -= 6;
  }

  const pages = pdf.getPages();
  pages.forEach((pg, i) => {
    const footer = `${opts.watermark ? opts.watermark + "  ·  " : ""}Page ${i + 1} of ${pages.length}`;
    pg.drawText(footer, { x: M, y: 28, size: 7.5, font: regular, color: rgb(0.45, 0.47, 0.5) });
  });
  return pdf.save();
}
