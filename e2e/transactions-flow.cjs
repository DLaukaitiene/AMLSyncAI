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
    await box.getByLabel("Amount", { exact: true }).fill(String(amount));
    await box.locator("select[name=method]").selectOption(method);
    await extra(box);
    await box.getByRole("button", { name: "Record Transaction" }).click();
  };
  await logTx(1500, "bank-transfer");
  await p.getByText(/Transaction for a client whose KYC isn't complete/).first().waitFor();
  log("R9: a payment for a client whose due diligence isn't complete is flagged");
  // 2) Cash above the €3,000 default threshold → R1
  await logTx(4000, "cash", async (box) => { await box.getByLabel("Description").fill("Reservation fee paid in cash"); });
  await p.getByText(/Cash of €4,000: identify and verify the customer/).first().waitFor();
  // Validation shared with the import: another currency needs an exchange rate
  await logTx(100, "card", async (box) => { await box.getByLabel("Currency").fill("USD"); });
  await p.getByText(/Enter the exchange rate \(euros per 1 USD\)/).first().waitFor();
  await p.reload();
  // 3) Crypto from a third party in a high-risk country → three flags
  await logTx(20000, "crypto", async (box) => { await box.getByLabel("Paid by someone other than the client").check(); await box.getByLabel("Funds come from (country)").fill("KP"); });
  await p.getByText(/Paid in crypto-assets/).first().waitFor();
  await p.reload();
  const rows = p.getByTestId("transaction");
  if ((await rows.count()) !== 3) throw new Error("✘ expected 3 transactions, got " + (await rows.count()));
  if (!/Flagged/.test(await rows.first().innerText())) throw new Error("✘ flagged should be listed first");
  const crypto = await rows.filter({ hasText: "€20,000" }).getByTestId("flags").innerText();
  for (const r of ["R6", "R7", "R9", "R11"]) if (!crypto.includes(r)) throw new Error(`✘ crypto row missing ${r}: ${crypto}`);
  log("rules R1, R6, R7, R9, R11 flag with rule, severity and message; flagged listed first");
  await p.goto(BASE + "/app/transactions?rule=R7");
  if ((await p.getByTestId("transaction").count()) !== 1) throw new Error("✘ rule filter");
  await p.goto(BASE + "/app/transactions?severity=medium&rule=R1");
  if ((await p.getByTestId("transaction").count()) !== 1) throw new Error("✘ rule + severity filter");
  await p.goto(BASE + "/app/transactions");
  log("filter by rule and severity");

  // Clear the cash one: a short reason is refused
  const cashRow = rows.filter({ hasText: "€4,000" });
  await cashRow.getByText("Review", { exact: true }).click();
  await cashRow.getByRole("radio", { name: /Mark as reviewed/ }).check();
  await cashRow.getByLabel("Reason *").fill("ok");
  await cashRow.getByRole("button", { name: "Record decision" }).click();
  await cashRow.getByText(/at least 20 characters/).first().waitFor();
  await cashRow.getByLabel("Reason *").fill("Reservation fee, receipt issued, cash below the €10,000 EU limit and client identified");
  await cashRow.getByRole("button", { name: "Record decision" }).click();
  await p.getByTestId("transaction").filter({ hasText: "€4,000" }).getByText("Reviewed", { exact: true }).waitFor();
  log("reviewing needs a reason of at least 20 characters; transaction marked Reviewed");

  // Escalate the crypto one to the Compliance Officer
  const cryptoRow = p.getByTestId("transaction").filter({ hasText: "€20,000" });
  await cryptoRow.getByText("Review", { exact: true }).click();
  await cryptoRow.getByRole("radio", { name: /Create investigation/ }).check();
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

  // Settings → Transaction monitoring
  await p.goto(BASE + "/app/settings/transaction-monitoring");
  if (await p.getByLabel("Legal cash payment limit (EUR)").count()) throw new Error("✘ cash fields shown without cash");
  await p.getByLabel("High-value transaction review from (EUR)").waitFor();
  await p.getByLabel("Our firm accepts or pays cash").check();
  await submit(p, "Save settings", "Settings saved");
  await p.reload();
  await p.getByLabel("Cash: identify and verify the customer from (EUR)").fill("20000");
  await submit(p, "Save settings", /between €100 and €10,000/);
  await p.getByLabel("Cash: identify and verify the customer from (EUR)").fill("1000");
  await p.getByLabel("Legal cash payment limit (EUR)").fill("3000");
  await p.getByLabel("I checked the legal limit today").check();
  await p.getByTestId("rule-toggles").getByLabel(/^R8 /).uncheck();
  await submit(p, "Save settings", "Settings saved");
  await p.reload();
  await p.getByTestId("legal-limit-checked").getByText(/Last checked: \d{4}-\d{2}-\d{2}/).waitFor();
  if (await p.getByTestId("rule-toggles").getByLabel(/^R8 /).isChecked()) throw new Error("✘ R8 still on");
  log("settings: cash fields only with cash; €10,000 cap enforced; legal limit with 'last checked'; R8 switched off");

  const csv = await (await ctx.request.get(BASE + "/api/registers/transactions", { maxRedirects: 0 })).text();
  if (!csv.includes("Reservation fee") || !csv.includes("investigated") || !csv.includes("Paid in crypto-assets")) throw new Error("✘ transaction log CSV: " + csv.slice(0, 300));
  log("Reports: Transaction Log CSV with flags and reviews");

  console.log("page errors:", errors);
  await b.close();
  if (errors.length) process.exit(1);
})().catch((e) => { console.error("✘", e.message); process.exit(1); });
