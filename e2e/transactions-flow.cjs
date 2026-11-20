/* eslint-disable @typescript-eslint/no-require-imports */
// Transaction Monitoring (Art. 26): CODE=… node e2e/transactions-flow.cjs
const { chromium } = require("playwright");
const { BASE, log, signupFirm, submit } = require("./helpers.cjs");

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const { p, ctx } = await signupFirm(b, { code: process.env.CODE, company: "Mokėjimai UAB", email: "owner@mokejimai.lt", sector: "ESTATE_AGENT" });
  p.on("pageerror", (e) => errors.push(e.message));

  await p.goto(BASE + "/app/transactions");
  await p.getByRole("heading", { name: "Transaction Monitoring" }).waitFor();
  await p.getByRole("link", { name: "Open a case" }).waitFor();
  log("empty Transaction Monitoring page asks for a matter first");

  await p.goto(BASE + "/app/matters/new");
  await p.getByLabel("Title *").fill("Sale of Vokiečių g. 3");
  await p.locator("select[name=type]").selectOption("PROPERTY_SALE");
  await p.getByLabel("Price (EUR)").fill("180000");
  await p.getByRole("button", { name: "Create case" }).click();
  await p.getByRole("heading", { name: "Sale of Vokiečių g. 3" }).waitFor();
  await p.getByText("Add a party").click();
  const d = p.locator("details", { hasText: "Add a party" });
  await d.locator("select[name=role]").selectOption("BUYER");
  await d.getByLabel("First names (all) *").fill("Jonas"); await d.getByLabel("Surname *").fill("Pirkėjas");
  await d.getByRole("button", { name: "Add party" }).click();
  await p.getByText("Party added.").first().waitFor();

  // 1) An ordinary transfer: recorded, no flag
  await p.goto(BASE + "/app/transactions");
  const logTx = async (amount, method, extra = async () => {}) => {
    const box = p.locator("details", { hasText: "Log Transaction" });
    if ((await box.getAttribute("open")) === null) await box.locator("summary").click();
    await box.getByLabel("Amount (EUR)").fill(String(amount));
    await box.locator("select[name=method]").selectOption(method);
    await extra(box);
    await box.getByRole("button", { name: "Record Transaction" }).click();
  };
  await logTx(1500, "bank-transfer");
  await p.getByText("No CDD trigger, report or red flag").waitFor();
  // 2) Cash above the €3,000 default threshold → flagged
  await logTx(4000, "cash", async (box) => { await box.getByLabel("Description").fill("Reservation fee paid in cash"); });
  await p.getByText(/Flagged for review in Transaction Monitoring: Cash payment of €4,000/).waitFor();
  // 3) Crypto from a third party in a high-risk country → three flags
  await logTx(20000, "crypto", async (box) => { await box.getByLabel("Paid by someone other than the client").check(); await box.getByLabel("Funds come from (country)").fill("KP"); });
  await p.getByText(/Paid in crypto-assets/).first().waitFor();
  await p.reload();
  const rows = p.getByTestId("transaction");
  if ((await rows.count()) !== 3) throw new Error("✘ expected 3 transactions, got " + (await rows.count()));
  if (!/Flagged/.test(await rows.first().innerText())) throw new Error("✘ flagged should be listed first");
  const flaggedCount = await p.getByText("Flagged exceptions").locator("..").innerText();
  if (!/\b2\b/.test(flaggedCount)) throw new Error("✘ flagged card: " + flaggedCount);
  log("cash ≥ €3,000 and crypto / third-party / high-risk-country payments flagged; flagged listed first");

  // Clear the cash one: a short reason is refused
  const cashRow = rows.filter({ hasText: "€4,000" });
  await cashRow.getByText("Review", { exact: true }).click();
  await cashRow.getByRole("radio", { name: /Mark as cleared/ }).check();
  await cashRow.getByLabel("Reason *").fill("ok");
  await cashRow.getByRole("button", { name: "Record decision" }).click();
  await cashRow.getByText(/at least 20 characters/).first().waitFor();
  await cashRow.getByLabel("Reason *").fill("Reservation fee, receipt issued, cash below the €10,000 EU limit and client identified");
  await cashRow.getByRole("button", { name: "Record decision" }).click();
  await p.getByTestId("transaction").filter({ hasText: "€4,000" }).getByText("Cleared", { exact: true }).waitFor();
  log("clearing needs a reason of at least 20 characters; transaction marked Cleared");

  // Escalate the crypto one to the Compliance Officer
  const cryptoRow = p.getByTestId("transaction").filter({ hasText: "€20,000" });
  await cryptoRow.getByText("Review", { exact: true }).click();
  await cryptoRow.getByRole("radio", { name: "Raise internal suspicion report" }).check();
  await cryptoRow.getByLabel("Reason *").fill("Crypto from a third party in North Korea, buyer could not explain the source");
  await cryptoRow.getByRole("button", { name: "Record decision" }).click();
  await p.getByTestId("transaction").filter({ hasText: "€20,000" }).getByText("Investigated", { exact: true }).waitFor();
  await p.getByTestId("transaction").filter({ hasText: "€20,000" }).getByRole("link", { name: "Open the internal report" }).click();
  await p.getByText(/Transaction of €20,000/).first().waitFor();
  log("escalation creates an internal suspicion report for the Compliance Officer; transaction Investigated");

  // Client's Transactions tab, dashboard, register export
  await p.goto(BASE + "/app/transactions");
  await p.getByTestId("transaction").first().getByRole("link", { name: "Jonas Pirkėjas" }).click();
  await p.getByRole("navigation", { name: "Profile tabs" }).getByRole("link", { name: /Transactions/ }).click();
  await p.getByTestId("client-transactions").getByText("€20,000").waitFor();
  log("client profile Transactions tab");

  // CSV import: one good row (cash → flagged), one row with an unknown payer
  await p.goto(BASE + "/app/transactions");
  await p.locator("summary", { hasText: "Import from CSV" }).click();
  const csvIn = "Data;Suma;Būdas;Klientas;Byla;Aprašymas\n05.11.2026;3.500,00;grynieji;Jonas Pirkėjas;Sale of Vokiečių g. 3;Second instalment\n06.11.2026;100;pavedimas;Nobody;Sale of Vokiečių g. 3;x\n";
  await p.locator("input[type=file][name=file]").setInputFiles({ name: "bank.csv", mimeType: "text/csv", buffer: Buffer.from(csvIn) });
  await submit(p, "Import", /1 transaction\(s\) imported, 1 flagged for review\. 1 row\(s\) not imported: line 3: "Nobody" is not a party/);
  log("CSV import: semicolon file with European numbers imported and flagged; bad row reported with its line");

  await p.goto(BASE + "/app/transactions");
  await p.getByText("Threshold settings").click();
  await p.getByLabel("Cash monitoring threshold (EUR)").fill("20000");
  await submit(p, "Save thresholds", /between €100 and €10,000/);
  await p.getByLabel("Cash monitoring threshold (EUR)").fill("1000");
  await submit(p, "Save thresholds", "Thresholds saved");
  log("thresholds: cash threshold can't exceed the EU €10,000 limit; saved");

  const csv = await (await ctx.request.get(BASE + "/api/registers/transactions", { maxRedirects: 0 })).text();
  if (!csv.includes("Second instalment") || !csv.includes("Reservation fee") || !csv.includes("investigated") || !csv.includes("Paid in crypto-assets")) throw new Error("✘ transaction log CSV: " + csv.slice(0, 300));
  log("Reports: Transaction Log CSV with flags and reviews");

  console.log("page errors:", errors);
  await b.close();
  if (errors.length) process.exit(1);
})().catch((e) => { console.error("✘", e.message); process.exit(1); });
