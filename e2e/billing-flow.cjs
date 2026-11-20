/* eslint-disable @typescript-eslint/no-require-imports */
// Monthly invoicing: usage → invoice (VAT, credit), PDF, overdue pause.
//   CODE=… node e2e/billing-flow.cjs     (needs CRON_SECRET and DATABASE_URL)
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const { BASE, log, signupFirm, submit } = require("./helpers.cjs");
const sql = (q) => execSync(`psql -At "${process.env.DATABASE_URL}"`, { input: q }).toString().trim();

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const { p } = await signupFirm(b, { code: process.env.CODE, company: "Sąskaita UAB", email: "owner@saskaita.lt", sector: "ESTATE_AGENT" });
  p.on("pageerror", (e) => errors.push(e.message));
  const firmId = sql(`SELECT id FROM "Firm" WHERE name = 'Sąskaita UAB'`);

  await p.goto(BASE + "/app/billing");
  await p.getByTestId("invoice-details").getByText(/Before your first invoice, please give us: .*registered address, company code, VAT number \(or confirm you aren't VAT-registered\), email for invoices/).waitFor();
  await p.getByLabel("Registered address *").fill("Gedimino pr. 1, Vilnius");
  await submit(p, "Save invoice details", /Enter the company code|Enter the VAT number/);
  await p.getByLabel("Company code *").fill("305123456");
  await p.getByLabel("VAT number").fill("LT 1000 1234 5678");
  await p.getByLabel("Email for invoices *").fill("saskaitos@saskaita.lt");
  await p.getByLabel("PO or reference number for invoices").fill("PO-2026-17");
  await submit(p, "Save invoice details", "Billing details saved");
  await p.reload();
  if (await p.getByText("Before your first invoice").count()) throw new Error("✘ details still requested");
  log("invoice details requested once before the first invoice, validated and saved");

  // Seats: Solo includes 2 users (the Owner + 1)
  sql(`UPDATE "Firm" SET plan = 'solo' WHERE id = '${firmId}'`);
  const invite = async (name, email) => {
    await p.goto(BASE + "/app/team");
    await p.getByLabel("Name *").fill(name); await p.getByLabel("Email *").fill(email);
    await p.getByRole("button", { name: "Send invitation", exact: true }).click();
  };
  await invite("Antra", "antra@saskaita.lt");
  await p.getByText("Invitation sent").first().waitFor();
  await invite("Trečia", "trecia@saskaita.lt");
  await p.getByText(/Your Solo plan includes 2 users\. For more users, contact contact@amlsync\.com/).first().waitFor();
  log("Solo plan: second user invited, third refused with contact-sales message");

  // 7 checks last month, 1 refunded; €49 monthly fee; €15 welcome credit from signup.
  sql(`UPDATE "Firm" SET plan = 'solo', "trialEndsOn" = NULL WHERE id = '${firmId}';
       UPDATE "CreditEntry" SET "createdAt" = date_trunc('month', now()) - interval '10 days' WHERE "firmId" = '${firmId}';
       INSERT INTO "CreditEntry" (id, "firmId", "amountCents", kind, description, "clientRef", "createdAt")
         SELECT gen_random_uuid(), '${firmId}', -300, 'charge', 'Identity check (document / eID, chip, liveness, face match)', 'Client ' || g, date_trunc('month', now()) - interval '5 days' FROM generate_series(1, 7) g;
       INSERT INTO "CreditEntry" (id, "firmId", "amountCents", kind, description, "createdAt") VALUES (gen_random_uuid(), '${firmId}', 300, 'refund', 'Refund: check expired without a result', date_trunc('month', now()) - interval '2 days');`);
  const run = () => execSync(`curl -s -X POST ${BASE}/api/cron/invoices -H "Authorization: Bearer ${process.env.CRON_SECRET}"`).toString();
  const r1 = run(), r2 = run();
  if (!/"issued":1/.test(r1) || !/"issued":0/.test(r2)) throw new Error(`✘ invoicing not idempotent: ${r1} / ${r2}`);
  log("cron issued one invoice; second run issued none");

  // 49 + 7×3 − 3 − 15 = 52.00 net; VAT 21 % = 10.92; total 62.92
  const inv = sql(`SELECT number || '|' || "netCents" || '|' || "vatCents" || '|' || "totalCents" FROM "Invoice" WHERE "firmId" = '${firmId}'`);
  if (!/^AMS-\d{4}-\d{5}\|5200\|1092\|6292$/.test(inv)) throw new Error("✘ wrong invoice totals " + inv);
  log("invoice totals: fee + 7 checks − refund − welcome credit = €52.00 + VAT €10.92 = €62.92 " + inv.split("|")[0]);
  const mail = sql(`SELECT count(*) FROM "DevEmail" WHERE "to" = 'saskaitos@saskaita.lt' AND subject LIKE 'AMLSync invoice%' AND text LIKE '%.pdf (%'`);
  if (mail !== "1") throw new Error("✘ invoice email not sent");
  const ym = sql(`SELECT to_char(date_trunc('month', now()) - interval '1 day', 'YYYY, MM')`);
  const copy = sql(`SELECT count(*) FROM "DevEmail" WHERE "to" = 'deimena@amlsync.com' AND subject = 'client invoice (Sąskaita UAB) (${ym})' AND text LIKE '%client invoice (Sąskaita UAB) (${ym}).pdf (%'`);
  if (copy !== "1") throw new Error("✘ invoice copy not sent to deimena@amlsync.com");
  log("invoice emailed with the PDF to the invoice email; copy 'client invoice (Sąskaita UAB) (" + ym + ")' to deimena@amlsync.com");

  await p.goto(BASE + "/app/billing");
  await p.getByRole("cell", { name: inv.split("|")[0] }).waitFor();
  const [dl] = await Promise.all([p.waitForEvent("download"), p.getByRole("link", { name: "Download" }).first().click()]);
  const pdf = require("fs").readFileSync(await dl.path());
  if (process.env.SAVE_PDF) require("fs").writeFileSync(process.env.SAVE_PDF, pdf);
  if (pdf.subarray(0, 5).toString() !== "%PDF-") throw new Error("✘ invoice is not a PDF");
  log("invoice PDF downloads");

  // Other firms can't read it
  const other = await b.newContext();
  const st = await (await other.request.get(BASE + "/api/invoices/" + sql(`SELECT id FROM "Invoice" WHERE "firmId" = '${firmId}'`))).status();
  if (st !== 404) throw new Error("✘ invoice readable without login: " + st);
  log("invoice not readable without login");

  // Overdue > 14 days pauses paid checks
  sql(`UPDATE "Invoice" SET "dueOn" = to_char(now() - interval '20 days', 'YYYY-MM-DD') WHERE "firmId" = '${firmId}'`);
  await p.goto(BASE + "/app/billing");
  await p.getByText("Overdue").first().waitFor();
  log("overdue invoice shown as Overdue");
  await p.goto(BASE + "/app/clients/new");
  await p.getByLabel("First names (all) *").fill("Ona");
  await p.getByLabel("Surname *").fill("Mokėtoja");
  await p.getByRole("button", { name: "Create client" }).click();
  await p.getByRole("heading", { name: "Ona Mokėtoja" }).waitFor();
  if (await p.getByRole("button", { name: "Send identity check (€2.00)" }).count()) {
    await submit(p, "Send identity check (€2.00)", "Paid checks are paused: invoice");
    log("paid checks paused while an invoice is >14 days overdue");
  } else log("(Didit not configured: overdue pause not exercised)");
  if (errors.length) console.log("✘ page errors", errors);
  console.log("page errors:", errors);
  await b.close();
})().catch((e) => { console.log("✘", e.message); process.exit(1); });
