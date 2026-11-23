import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getSession } from "@/lib/server/session";
import { COLUMNS, CSV_TEMPLATE, HEADERS, METHODS } from "@/lib/transactions/format";

/** Transaction import template: ?format=csv (UTF-8, comma) or ?format=xlsx (with a Lithuanian "Instrukcija" sheet). */
export async function GET(req: Request) {
  const s = await getSession();
  if (!s || s.stage !== "ACTIVE") return new NextResponse("Not found", { status: 404 });
  const format = new URL(req.url).searchParams.get("format");
  if (format !== "xlsx") {
    return new NextResponse("﻿" + CSV_TEMPLATE, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="amlsync-transactions-template.csv"' } });
  }
  const wb = new ExcelJS.Workbook();
  wb.creator = "AMLSync App";
  const ws = wb.addWorksheet("Transactions");
  ws.addRow(HEADERS);
  ws.addRow(COLUMNS.map((c) => c.example));
  ws.getRow(1).font = { bold: true };
  ws.columns.forEach((col, i) => { col.width = Math.max(12, HEADERS[i].length + 4); });
  // Dates and codes as text, so Excel doesn't change them.
  for (const name of ["date", "client_code", "external_id"]) ws.getColumn(HEADERS.indexOf(name) + 1).numFmt = "@";
  const ins = wb.addWorksheet("Instrukcija");
  ins.addRow(["Stulpelis", "Privalomas", "Formatas", "Pavyzdys", "Paaiškinimas"]).font = { bold: true };
  for (const c of COLUMNS) ins.addRow([c.name, c.required === "yes" ? "taip" : c.required === "no" ? "ne" : "jei ne EUR", c.format, c.example, c.lt]);
  ins.addRow([]);
  ins.addRow(["Mokėjimo būdai (method)", METHODS.join(", ")]);
  ins.addRow(["Taip / ne laukai", "yes/no, true/false, 1/0, taip/ne"]);
  ins.addRow(["Daugiausia", "5 000 eilučių ir 5 MB viename faile"]);
  ins.addRow(["Pirmas lapas", "Pildykite lapą „Transactions“; antraštės eilutę palikite angliškai, kaip yra."]);
  ins.columns = [{ width: 22 }, { width: 12 }, { width: 38 }, { width: 18 }, { width: 90 }];
  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buf as ArrayBuffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="amlsync-transactions-template.xlsx"' } });
}
