import "server-only";
import ExcelJS from "exceljs";
import type { Prisma } from "@prisma/client";
import { adminDb, withTenant, type Tx } from "./db";
import { audit } from "./audit";
import { applyTransactionFlags, highRiskCountrySet, ruleContextFor } from "./transactions";
import { parseCsv } from "@/lib/screening/csv";
import { COLUMNS, MAX_BYTES, tableToRows, toEur, validateRow, type ParsedRow } from "@/lib/transactions/format";
import { runRules, statusFor, type MonitoringFlag, type RuleTx } from "@/lib/monitoring/rules";

type Ctx = { firmId: string; userId: string };

export interface PreviewRow {
  line: number;
  raw: Record<string, string>;
  status: "ok" | "error" | "duplicate";
  error?: string;
  note?: string; // e.g. the name in the file differs from the client's name
  clientName?: string;
  matterTitle?: string; // existing case, or the general case that will be created
  amountEUR?: number;
  fxRate?: number | null;
  data?: ParsedRow & { customerId: string; matterId: string | null };
  flags?: MonitoringFlag[];
}

/** Reads an uploaded .csv or .xlsx into a table of strings. */
export async function readTable(fileName: string, bytes: Uint8Array): Promise<string[][] | { error: string }> {
  if (bytes.length > MAX_BYTES) return { error: "The file is larger than 5 MB. Split it into smaller files." };
  if (/\.xlsx$/i.test(fileName)) {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
    } catch {
      return { error: "The Excel file couldn't be read. Save it again as .xlsx, or use the CSV template." };
    }
    const ws = wb.worksheets[0];
    if (!ws) return { error: "The Excel file has no sheets." };
    const table: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      for (let c = 1; c <= Math.max(ws.columnCount, COLUMNS.length); c++) {
        const v = row.getCell(c).value as unknown;
        cells.push(
          v instanceof Date ? v.toISOString().slice(0, 10)
          : v && typeof v === "object" && "result" in (v as object) ? String((v as { result: unknown }).result ?? "")
          : v && typeof v === "object" && "text" in (v as object) ? String((v as { text: unknown }).text ?? "")
          : v === null || v === undefined ? "" : String(v),
        );
      }
      table.push(cells);
    });
    return table;
  }
  if (!/\.csv$/i.test(fileName)) return { error: "Upload a .csv or .xlsx file (download the template)." };
  const text = new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "");
  const first = text.split("\n")[0];
  const delimiter = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  return parseCsv(text, delimiter);
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const generalTitle = (client: string) => `General — ${client}`;
const dupKey = (customerId: string, r: { date: string; originalAmount: number; currency: string; method: string }) => `${customerId}|${r.date}|${r.originalAmount.toFixed(2)}|${r.currency}|${r.method}`;

/**
 * Checks every row without saving any transaction: format, client and case lookups (inside the firm only:
 * the queries run under the firm's row-level security), exchange rates, duplicates and the rules each row
 * would trigger. Stores the result as a preview batch.
 */
export async function previewImport(ctx: Ctx, fileName: string, table: string[][]): Promise<{ batchId: string } | { error: string }> {
  const parsed = tableToRows(table);
  if ("error" in parsed) return parsed;
  const highRisk = await highRiskCountrySet();
  const usd = new Map((await adminDb.fxRate.findMany()).map((r) => [r.date, Number(r.usdPerEur)]));
  return withTenant(ctx.firmId, async (tx) => {
    // Clients: company code (registration number) or the client's ID in AMLSync (file id, or its first 8 characters).
    const files = await tx.cddFile.findMany({ where: { role: "CLIENT" }, select: { id: true, partyId: true, party: { select: { displayName: true, details: true } } } });
    const byCode = new Map<string, { partyId: string; name: string }[]>();
    const add = (k: string, v: { partyId: string; name: string }) => { const key = norm(k); if (key) byCode.set(key, [...(byCode.get(key) ?? []).filter((x) => x.partyId !== v.partyId), v]); };
    for (const f of files) {
      const v = { partyId: f.partyId, name: f.party.displayName };
      add(f.id, v); add(f.id.slice(0, 8), v);
      const reg = (f.party.details as { registrationNumber?: string } | null)?.registrationNumber;
      if (reg) add(String(reg), v);
    }
    const matters = await tx.matterParty.findMany({ select: { partyId: true, matterId: true, matter: { select: { title: true } } } });
    const existingExt = new Set((await tx.transaction.findMany({ where: { externalId: { not: null } }, select: { externalId: true } })).map((t) => norm(t.externalId!)));
    const seenExt = new Set<string>(), seenKeys = new Set<string>();
    const contexts = new Map<string, Awaited<ReturnType<typeof ruleContextFor>>>();
    const fileHistory = new Map<string, RuleTx[]>(); // earlier rows of this file per client, so linked-payment rules see them
    const out: PreviewRow[] = [];
    for (const { line, raw } of parsed.rows) {
      const v = validateRow(raw);
      if (!v.ok) { out.push({ line, raw, status: "error", error: `Row ${line}: ${v.error}.` }); continue; }
      const r = v.row;
      const hits = byCode.get(norm(r.clientCode)) ?? [];
      if (!hits.length) { out.push({ line, raw, status: "error", error: `Row ${line}: client code ${r.clientCode} not found — add the client first or fix the code.` }); continue; }
      if (hits.length > 1) { out.push({ line, raw, status: "error", error: `Row ${line}: client code ${r.clientCode} matches ${hits.length} clients — use the client's ID from AMLSync instead.` }); continue; }
      const client = hits[0];
      let matterId: string | null = null, matterTitle = generalTitle(client.name);
      if (r.matterRef) {
        const m = matters.filter((x) => x.partyId === client.partyId && norm(x.matter.title) === norm(r.matterRef));
        if (!m.length) { out.push({ line, raw, status: "error", error: `Row ${line}: case "${r.matterRef}" not found for ${client.name} — check the name or leave matter_ref empty.` }); continue; }
        matterId = m[0].matterId; matterTitle = m[0].matter.title;
      }
      let fx = r.fxRate;
      if (r.currency !== "EUR" && fx === null) {
        const usdPerEur = r.currency === "USD" ? usd.get(r.date) : undefined;
        if (!usdPerEur) { out.push({ line, raw, status: "error", error: `Row ${line}: no fx_rate for ${r.currency} — add the rate (euros per 1 ${r.currency}).` }); continue; }
        fx = Math.round((1 / usdPerEur) * 1e6) / 1e6;
      }
      const amountEUR = r.currency === "EUR" ? r.originalAmount : toEur(r.originalAmount, fx!);
      const note = r.clientName && norm(r.clientName) !== norm(client.name) ? `Name in the file "${r.clientName}" differs from "${client.name}".` : undefined;
      // Duplicates: same external id, or (without one) same client + date + amount + currency + method.
      const ext = r.externalId ? norm(r.externalId) : null;
      const key = dupKey(client.partyId, r);
      let dup = ext ? existingExt.has(ext) || seenExt.has(ext) : seenKeys.has(key);
      if (!dup && !ext) {
        dup = (await tx.transaction.count({ where: { customerId: client.partyId, date: new Date(r.date), method: r.method, OR: [{ originalAmount: r.originalAmount, originalCurrency: r.currency }, ...(r.currency === "EUR" ? [{ originalAmount: null, amountEUR: r.originalAmount }] : [])] } })) > 0;
      }
      if (dup) { out.push({ line, raw, status: "duplicate", error: `Row ${line}: already recorded${ext ? ` (external_id ${r.externalId})` : " (same client, date, amount, currency and method)"} — skipped.`, clientName: client.name }); continue; }
      if (ext) seenExt.add(ext);
      seenKeys.add(key);
      if (!contexts.has(client.partyId)) contexts.set(client.partyId, await ruleContextFor(tx, ctx.firmId, client.partyId, r.date, highRisk));
      const base = contexts.get(client.partyId)!;
      const rt: RuleTx = { id: `row-${line}`, date: r.date, amountEUR, method: r.method, occasional: r.occasional, thirdPartyPayer: r.thirdPartyPayer, fromCountry: r.fromCountry };
      const earlier = fileHistory.get(client.partyId) ?? [];
      const flags = runRules(rt, { ...base, history: [...base.history, ...earlier] });
      fileHistory.set(client.partyId, [...earlier, rt]);
      out.push({ line, raw, status: "ok", note, clientName: client.name, matterTitle, amountEUR, fxRate: fx, flags, data: { ...r, fxRate: fx, customerId: client.partyId, matterId } });
    }
    const batch = await tx.txImportBatch.create({
      data: { firmId: ctx.firmId, fileName: fileName.slice(0, 200), rows: out as unknown as Prisma.InputJsonValue, createdById: ctx.userId,
        rejected: out.filter((x) => x.status === "error").length, duplicates: out.filter((x) => x.status === "duplicate").length },
    });
    return { batchId: batch.id };
  }, { timeoutMs: 120_000 });
}

async function generalMatter(tx: Tx, firmId: string, customerId: string, clientName: string): Promise<string> {
  const title = generalTitle(clientName);
  const existing = await tx.matterParty.findFirst({ where: { partyId: customerId, matter: { title } }, select: { matterId: true } });
  if (existing) return existing.matterId;
  const firm = await tx.firm.findUniqueOrThrow({ where: { id: firmId }, select: { sectors: true } });
  const m = await tx.matter.create({ data: { firmId, type: "OTHER", sector: firm.sectors[0] ?? "OTHER", title, details: { general: true } as Prisma.InputJsonValue } });
  await tx.matterParty.create({ data: { firmId, matterId: m.id, partyId: customerId, role: "CLIENT" } });
  return m.id;
}

/** Saves the valid rows of a previewed file, runs the rules on each, and records the batch. Never starts a paid check. */
export async function confirmImport(ctx: Ctx, batchId: string): Promise<{ imported: number; flagged: number; duplicates: number; rejected: number } | { error: string }> {
  return withTenant(ctx.firmId, async (tx) => {
    const claimed = await tx.txImportBatch.updateMany({ where: { id: batchId, status: "preview" }, data: { status: "importing" } });
    if (!claimed.count) return { error: "This file was already imported or cancelled." };
    const batch = await tx.txImportBatch.findUniqueOrThrow({ where: { id: batchId } });
    const rows = (batch.rows as unknown as PreviewRow[]).filter((r) => r.status === "ok" && r.data).sort((a, b) => a.data!.date.localeCompare(b.data!.date) || a.line - b.line);
    const highRisk = await highRiskCountrySet();
    let imported = 0, flagged = 0, duplicates = batch.duplicates;
    for (const r of rows) {
      const d = r.data!;
      // Check duplicates again: another import may have saved the same rows since the preview.
      if (d.externalId && (await tx.transaction.count({ where: { externalId: { equals: d.externalId, mode: "insensitive" } } }))) { duplicates++; continue; }
      const matterId = d.matterId ?? (await generalMatter(tx, ctx.firmId, d.customerId, r.clientName ?? "client"));
      const t = await tx.transaction.create({
        data: {
          firmId: ctx.firmId, matterId, customerId: d.customerId, date: new Date(d.date), amountEUR: r.amountEUR!, originalAmount: d.originalAmount, originalCurrency: d.currency,
          fxRate: d.currency === "EUR" ? null : r.fxRate ?? null, method: d.method, occasional: d.occasional, thirdPartyPayer: d.thirdPartyPayer, fromCountry: d.fromCountry,
          description: d.description, direction: d.direction, counterpartyName: d.counterpartyName, externalId: d.externalId, importBatchId: batchId, monitorStatus: "pending",
        },
      });
      const flags = await applyTransactionFlags(tx, ctx, t.id, highRisk);
      imported++;
      if (flags.length) flagged++;
    }
    await tx.txImportBatch.update({ where: { id: batchId }, data: { status: "imported", imported, flagged, duplicates, importedAt: new Date() } });
    await audit(tx, { firmId: ctx.firmId, userId: ctx.userId, action: "create", objectType: "TxImportBatch", objectId: batchId, fields: [`file:${batch.fileName}`, `imported:${imported}`, `duplicates:${duplicates}`, `rejected:${batch.rejected}`, `flagged:${flagged}`] });
    return { imported, flagged, duplicates, rejected: batch.rejected };
  }, { timeoutMs: 300_000 });
}

export async function cancelImport(ctx: Ctx, batchId: string) {
  await withTenant(ctx.firmId, async (tx) => {
    const n = await tx.txImportBatch.updateMany({ where: { id: batchId, status: "preview" }, data: { status: "cancelled" } });
    if (n.count) await audit(tx, { firmId: ctx.firmId, userId: ctx.userId, action: "update", objectType: "TxImportBatch", objectId: batchId, fields: ["cancelled"] });
  });
}

export const UNDO_HOURS = 24;

/** Why a batch can't be undone, or null if it can: within 24 hours and none of its rows reviewed or escalated. */
export async function undoBlocker(tx: Tx, batch: { id: string; status: string; importedAt: Date | null }): Promise<string | null> {
  if (batch.status !== "imported" || !batch.importedAt) return "Only an imported file can be undone.";
  if (Date.now() - batch.importedAt.getTime() > UNDO_HOURS * 3600_000) return "The 24 hours for undoing this import have passed.";
  const reviewed = await tx.transaction.count({ where: { importBatchId: batch.id, OR: [{ reviewedAt: { not: null } }, { caseId: { not: null } }] } });
  return reviewed ? `${reviewed} of its transactions have been reviewed, so the import can't be undone.` : null;
}

export async function undoImport(ctx: Ctx, batchId: string): Promise<{ removed: number } | { error: string }> {
  return withTenant(ctx.firmId, async (tx) => {
    const batch = await tx.txImportBatch.findUnique({ where: { id: batchId } });
    if (!batch) return { error: "Not found." };
    const why = await undoBlocker(tx, batch);
    if (why) return { error: why };
    const removed = (await tx.transaction.deleteMany({ where: { importBatchId: batchId } })).count;
    await tx.txImportBatch.update({ where: { id: batchId }, data: { status: "undone", undoneAt: new Date() } });
    await audit(tx, { firmId: ctx.firmId, userId: ctx.userId, action: "delete", objectType: "TxImportBatch", objectId: batchId, fields: [`undone:${removed}`] });
    return { removed };
  });
}

/** The rows that were not imported, as the original columns plus an "error" column. */
export function errorCsv(rows: PreviewRow[]): string {
  const cols = COLUMNS.map((c) => c.name);
  const cell = (v: string) => (/[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [[...cols, "error"].join(","), ...rows.filter((r) => r.status !== "ok").map((r) => [...cols.map((c) => cell(r.raw[c] ?? "")), cell(r.error ?? "")].join(","))].join("\n") + "\n";
}

export { statusFor };
