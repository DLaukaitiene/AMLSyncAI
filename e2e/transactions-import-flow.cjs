/* eslint-disable @typescript-eslint/no-require-imports */
// Transaction import (CSV / XLSX): template, preview, firm isolation, duplicates, rules, error file, undo.
//   CODE1=… CODE2=… node e2e/transactions-import-flow.cjs   (SHOT=path saves a screenshot of the preview)
const { chromium } = require("playwright");
const ExcelJS = require("exceljs");
const { BASE, log, signupFirm, submit } = require("./helpers.cjs");

const HEAD = "date,client_code,client_name,matter_ref,amount,currency,fx_rate,method,direction,counterparty_name,from_country,third_party_payer,occasional,description,external_id";

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const { p } = await signupFirm(b, { code: process.env.CODE1, company: "Importas UAB", email: "owner@importas.lt", sector: "ACCOUNTANT" });
  const { p: other } = await signupFirm(b, { code: process.env.CODE2, company: "Kita Firma UAB", email: "owner@kitafirma.lt", sector: "ACCOUNTANT" });
  for (const x of [p, other]) x.on("pageerror", (e) => errors.push(e.message));
  const company = async (page, name, code) => {
    await page.goto(BASE + "/app/clients/new");
    await page.getByRole("radio", { name: "Company or other organisation" }).check();
    await page.getByLabel("Legal name *").fill(name);
    await page.getByLabel("Registration number").fill(code);
    await page.getByRole("button", { name: "Create client" }).click();
    await page.getByRole("heading", { name }).waitFor();
  };
  await company(p, "Pavyzdys UAB", "306139764");
  await company(other, "Svetimas UAB", "111222333");

  // Templates
  await p.goto(BASE + "/app/transactions");
  await p.getByRole("link", { name: "Import from CSV or Excel" }).click();
  await p.getByRole("heading", { name: "Import transactions" }).waitFor();
  const csvT = await (await p.request.get(BASE + "/api/transactions/template?format=csv")).text();
  if (!csvT.replace(/^﻿/, "").startsWith(HEAD)) throw new Error("✘ csv template header: " + csvT.slice(0, 200));
  const xbuf = await (await p.request.get(BASE + "/api/transactions/template?format=xlsx")).body();
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(xbuf);
  if (wb.worksheets.map((w) => w.name).join(",") !== "Transactions,Instrukcija") throw new Error("✘ xlsx sheets");
  if (!/grynieji/.test(JSON.stringify(wb.getWorksheet("Instrukcija").getSheetValues()))) throw new Error("✘ Lithuanian instructions");
  if (process.env.TPL) { require("fs").writeFileSync(process.env.TPL + "/amlsync-transactions-template.csv", csvT); require("fs").writeFileSync(process.env.TPL + "/amlsync-transactions-template.xlsx", xbuf); }
  log("templates: CSV with the 15 columns; XLSX with Transactions and a Lithuanian Instrukcija sheet");

  // The XLSX template itself: its example row names a case that doesn't exist here, so it is explained and not imported
  await p.locator("input[type=file][name=file]").setInputFiles({ name: "template.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: xbuf });
  await p.getByRole("button", { name: "Check the file" }).click();
  await p.getByRole("heading", { name: "Check the file before importing" }).waitFor();
  await p.getByTestId("preview-table").getByText(/Row 2: case "Sale Gedimino 1" not found for Pavyzdys UAB/).waitFor();
  await p.getByTestId("import-decision").getByRole("button", { name: "Cancel" }).click();
  await p.getByText("Import cancelled. Nothing was saved.").waitFor();
  log("XLSX upload read and previewed; cancel saves nothing");

  const csv = [HEAD,
    "2026-11-02,306139764,UAB Pavyzdys,,4000.00,EUR,,cash,in,,LT,no,yes,Cash deposit,INV-1",
    "2026-13-01,306139764,,,100,EUR,,card,,,,no,no,bad date,",
    "2026-11-03,999999999,Nobody,,100,EUR,,card,,,,no,no,unknown client,",
    "2026-11-18,306139764,,,500,USD,,card,,,,no,no,dollars without a rate,",
    "2026-11-04,111222333,Svetimas UAB,,100,EUR,,card,,,,no,no,other firm's client,",
    "2026-11-05,306139764,,,50,EUR,,card,,,,no,no,same reference again,INV-1",
    "2026-11-06,306139764,,,2000,EUR,,grynieji,,,,ne,taip,cash 1,",
    "2026-11-12,306139764,,,2000,EUR,,cash,,,,no,yes,cash 2,",
    "2026-11-19,306139764,,,2000,EUR,,cash,,,,no,yes,cash 3,",
    "2026-11-20,306139764,Pavyzdys,,1000,USD,0.9,bank transfer,in,John Smith,US,yes,no,dollars with a rate,INV-2",
  ].join("\n");
  await p.goto(BASE + "/app/transactions/import");
  await p.locator("input[type=file][name=file]").setInputFiles({ name: "bank.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await p.getByRole("button", { name: "Check the file" }).click();
  await p.getByRole("heading", { name: "Check the file before importing" }).waitFor();
  const table = await p.getByTestId("preview-table").innerText();
  for (const s of [
    /Row 3: date "2026-13-01" is not a date/, /Row 4: client code 999999999 not found — add the client first or fix the code\./,
    /Row 5: no fx_rate for USD/, /Row 6: client code 111222333 not found/, /Row 7: already recorded \(external_id INV-1\)/,
    /R3 · high · Linked cash payments total €6,000 in 30 days/, /R1 · medium · Cash of €4,000/, /R6 · medium · Paid by someone other than the client/,
  ]) if (!s.test(table)) throw new Error("✘ preview missing " + s + "\n" + table.slice(0, 1500));
  const counts = await p.getByTestId("import-counts").innerText();
  if (!/Ready to import\s*5/.test(counts) || !/Rejected\s*4/.test(counts) || !/duplicate\s*1/i.test(counts)) throw new Error("✘ counts " + counts);
  if (process.env.SHOT) {
    const hi = await (await b.newContext({ storageState: await p.context().storageState(), viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 })).newPage();
    await hi.goto(p.url()); await hi.getByTestId("preview-table").waitFor();
    await hi.screenshot({ path: process.env.SHOT, fullPage: true }); await hi.close();
  }
  log("preview: 5 OK, 4 rejected in plain words (bad date, unknown client, USD without rate, another firm's client), 1 duplicate; rules shown per row (R1, R3 on the third €2,000 cash payment, R6)");

  const errCsv = await (await p.request.get(p.url().replace("/app/transactions/import/", "/api/transactions/import/") + "/errors")).text();
  if (!/,error\r?\n/.test(errCsv.split("\n")[0] + "\n") || !/999999999.*not found/.test(errCsv)) throw new Error("✘ error file " + errCsv.slice(0, 400));
  log("error file: original columns plus an error column");

  const batchUrl = p.url();
  await p.getByTestId("import-decision").getByRole("button", { name: "Import 5 valid row(s)" }).click();
  await p.getByTestId("import-done").waitFor();
  const done = await p.getByTestId("import-counts").innerText();
  if (!/Imported\s*5/.test(done) || !/Flagged\s*5/.test(done)) throw new Error("✘ summary " + done);
  await p.getByRole("link", { name: "See these transactions" }).click();
  await p.getByTestId("transaction").first().waitFor();
  if ((await p.getByTestId("transaction").count()) !== 5) throw new Error("✘ batch filter: " + (await p.getByTestId("transaction").count()) + " " + p.url());
  await p.getByText("€900").first().waitFor(); // 1,000 USD × 0.9
  log("imported 5 rows (USD converted with the file's rate), all flagged (R9: KYC not complete); batch filter shows them");

  // Same file again: everything already there is skipped
  await p.goto(BASE + "/app/transactions/import");
  await p.locator("input[type=file][name=file]").setInputFiles({ name: "bank-again.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await p.getByRole("button", { name: "Check the file" }).click();
  await p.getByRole("heading", { name: "Check the file before importing" }).waitFor();
  const again = await p.getByTestId("import-counts").innerText();
  if (!/Ready to import\s*0/.test(again) || !/duplicate\s*6/i.test(again)) throw new Error("✘ duplicates on re-upload " + again);
  log("re-uploading the same file: all 6 earlier rows skipped as duplicates (by reference, or client + date + amount + currency + method)");

  // Too many rows
  const big = [HEAD, ...Array.from({ length: 5001 }, (_, i) => `2026-11-01,306139764,,,${i + 1},EUR,,card,,,,no,no,,`)].join("\n");
  await p.goto(BASE + "/app/transactions/import");
  await p.locator("input[type=file][name=file]").setInputFiles({ name: "big.csv", mimeType: "text/csv", buffer: Buffer.from(big) });
  await submit(p, "Check the file", /The file has 5001 rows\. The limit is 5,000/);
  log("a file with 5,001 rows is refused");

  // Undo the whole import
  await p.goto(batchUrl);
  await p.getByRole("button", { name: "Undo the whole import" }).click();
  await p.getByText(/This import was undone on/).first().waitFor();
  await p.goto(BASE + "/app/transactions");
  if (await p.getByTestId("transaction").count()) throw new Error("✘ transactions left after undo");
  log("undo within 24 hours removes the whole batch");

  // The other firm sees nothing of it
  await other.goto(BASE + "/app/transactions/import");
  if (await other.getByText("bank.csv").count()) throw new Error("✘ other firm sees the import");
  const r = await other.request.get(batchUrl.replace("/app/transactions/import/", "/api/transactions/import/") + "/errors");
  if (r.status() !== 404) throw new Error("✘ other firm can read the error file: " + r.status());
  log("another firm can't see the import or its error file");

  console.log("page errors:", errors);
  await b.close();
})().catch((e) => { console.log("✘", e.message); process.exit(1); });
