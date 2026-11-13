/* eslint-disable @typescript-eslint/no-require-imports */
// Suspicion reporting end-to-end (spec §4.6, §11.10).   CODE=… node e2e/cases-flow.cjs
const { chromium } = require("playwright");
const fs = require("fs");
const { BASE, log, signupFirm, submit, lastMail, totp } = require("./helpers.cjs");

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const { p } = await signupFirm(b, { code: process.env.CODE, company: "Būstas UAB", email: "owner@bustas.lt", sector: "ESTATE_AGENT" });
  p.on("pageerror", (e) => errors.push(e.message));

  // Staff member
  await p.goto(BASE + "/app/team");
  await p.getByLabel("Name *").fill("Bob Agent"); await p.getByLabel("Email *").fill("bob@bustas.lt");
  await submit(p, "Send invitation", "Invitation sent");
  const q = await (await b.newContext()).newPage();
  q.on("pageerror", (e) => errors.push(e.message));
  await q.goto(await lastMail(q, "bob@bustas.lt"));
  await q.getByLabel("Choose a password *").fill("another long passphrase 42");
  await q.getByRole("button", { name: "Accept invitation" }).click();
  await q.getByRole("heading", { name: "Set up two-factor authentication" }).waitFor();
  await q.getByText("Can't scan?").click();
  const bs = (await q.locator("details code").innerText()).replace(/\s/g, "");
  await q.getByLabel("6-digit code").fill(totp(bs)); await q.getByRole("button", { name: /Turn on/ }).click();
  await q.getByTestId("recovery-codes").waitFor(); await q.getByRole("link", { name: /continue/ }).click();
  await q.getByRole("heading", { name: "Dashboard" }).waitFor();

  // Matter with buyer and seller
  await q.goto(BASE + "/app/matters/new");
  await q.getByLabel("Title *").fill("Sale of Pilies g. 5");
  await q.locator("select[name=type]").selectOption("PROPERTY_SALE");
  await q.getByLabel("Price (EUR)").fill("420000");
  await q.getByRole("button", { name: "Create matter" }).click();
  await q.getByRole("heading", { name: "Sale of Pilies g. 5" }).waitFor();
  const matterUrl = q.url();
  for (const [role, f, l] of [["BUYER", "Marius", "Pirkėjas"], ["SELLER", "Ona", "Pardavėja"]]) {
    await q.getByText("Add a party").click();
    const d = q.locator("details", { hasText: "Add a party" });
    await d.locator("select[name=role]").selectOption(role);
    await d.getByLabel("First names (all) *").fill(f); await d.getByLabel("Surname *").fill(l);
    await d.getByRole("button", { name: "Add party" }).click();
    await q.getByText("Party added.").first().waitFor(); await q.reload();
  }

  // Staff raises a suspicion, then can't see it
  await q.getByText("Report a suspicion to the Compliance Officer").click();
  await q.getByLabel("What happened? *").fill("Buyer wants to pay €200,000 of the price in cash via a third person");
  await q.getByLabel("Why does it seem suspicious? *").fill("Unexplained third-party cash, buyer avoided questions about the source of funds");
  await q.getByLabel("Amount involved (EUR)").fill("200000");
  await submit(q, "Send report", "Sent to the Compliance Officer");
  log("staff raised an internal report");
  const nav = await q.getByRole("navigation", { name: "Main" }).innerText();
  if (/Cases|Reports/.test(nav)) throw new Error("staff sees Cases/Reports");
  if ((await q.goto(BASE + "/app/cases")).status() !== 404) throw new Error("staff can open cases");
  if ((await q.goto(BASE + "/app/reports")).status() !== 404) throw new Error("staff can open reports");
  log("staff can't open Cases or Reports afterwards (404)");
  await q.goto(matterUrl);
  const buyerFile = await q.getByRole("link", { name: "CDD in progress" }).first().getAttribute("href");
  await q.goto(BASE + buyerFile);
  await q.getByText(/tipping-off is prohibited/).waitFor();
  log("client file shows the tipping-off warning, not the case");

  // CO decides: report + hold
  await p.goto(BASE + "/app/cases");
  await p.getByRole("link", { name: "Internal suspicion report" }).first().click();
  await p.waitForURL(/\/app\/cases\/[0-9a-f-]{36}$/);
  await p.getByText("Buyer wants to pay €200,000").first().waitFor();
  await p.getByRole("radio", { name: "Report to the FIU" }).check();
  await p.getByLabel("Reasons *").fill("Cash via an unrelated third person with no explanation of source; buyer evasive. Grounds for suspicion.");
  await submit(p, "Record decision", /Held until \d{4}-\d{2}-\d{2}/);
  log("CO decision recorded:", await p.getByText(/Held until/).first().innerText());
  const caseUrl = p.url();

  await q.goto(matterUrl);
  await q.getByText(/Transaction on hold pending FIU/).waitFor();
  log("matter shows the hold");
  await p.goto(matterUrl);
  await p.getByLabel("Override reason (Compliance Officer)").last().fill("Client insists on completing today");
  await submit(p, "Mark matter completed", /Cannot be overridden/);
  log("hold can't be overridden");

  // STR: export; submitted blocked until FIU channel set
  await p.goto(caseUrl);
  await p.getByText(/Complete your Country Profile: the FIU reporting channel is empty/).waitFor();
  log("STR can't be marked submitted without an FIU channel");
  const [dl] = await Promise.all([p.waitForEvent("download"), p.getByRole("link", { name: "Export for upload" }).first().click()]);
  const text = fs.readFileSync(await dl.path(), "utf8");
  if (!text.includes("CONFIDENTIAL") || !text.includes("Marius Pirkėjas") || !text.includes("NARRATIVE")) throw new Error("export content:\n" + text);
  log("STR exported:", text.split("\n").slice(0, 2).join(" | "));
  await p.goto(BASE + "/app/settings/country-profile");
  await p.getByLabel("FIU name").fill("FNTT"); await p.getByLabel("FIU reporting channel").fill("https://www.fntt.lt");
  await submit(p, "Save new version", "Saved as version 2");
  await p.goto(caseUrl);
  // AI draft of the narrative (AI_PROVIDER=mock in tests)
  await submit(p, "Draft narrative with AI", "AI draft added");
  await p.reload();
  if (!/\[AI draft\]/.test(await p.getByLabel("Narrative", { exact: true }).inputValue())) throw new Error("AI narrative missing");
  await p.getByText("AI-drafted", { exact: true }).first().waitFor();
  log("STR narrative drafted with AI and marked AI-drafted");
  await p.getByLabel("Submission reference / receipt number *").fill("FNTT-2026-00042");
  await submit(p, "Mark as submitted", "Confirm that you reviewed and corrected the AI-drafted narrative.");
  await p.getByLabel("I reviewed and corrected the AI-drafted narrative").check();
  await submit(p, "Mark as submitted", /submitted \d{4}-\d{2}-\d{2}, ref\. FNTT-2026-00042/);
  log("AI-drafted STR can only be submitted after the CO confirms the review");
  log("STR marked submitted with receipt reference");

  // FIU says proceed → hold lifted
  await p.getByLabel("How and when the FIU instructed you *").fill("Phone call from FNTT analyst, 14:10");
  await submit(p, "Record FIU instruction", "The FIU allowed the transaction to proceed.");
  await q.goto(matterUrl);
  if (await q.getByText(/Transaction on hold pending FIU/).count()) throw new Error("hold not lifted");
  log("FIU 'proceed' lifts the hold");

  // FIU request with 2-working-day deadline (received Friday)
  await p.goto(BASE + "/app/cases");
  await p.getByLabel("Received on *").fill("2026-11-13");
  await p.getByLabel("FIU reference *").fill("REQ-77");
  await p.getByLabel("What the FIU asked for *").fill("All CDD documents for Marius Pirkėjas");
  await p.getByLabel("FIU deadline (working days)").fill("2");
  await submit(p, "Log request", "FIU request logged. Answer by 2026-11-17.");
  log("FIU request due 2026-11-17 (2 working days after Friday 13 Nov)");
  await p.goto(BASE + "/app/calendar");
  await p.getByText("FIU request").first().waitFor();

  // A "no report" decision is kept
  await q.goto(matterUrl);
  await q.getByText("Report a suspicion to the Compliance Officer").click();
  await q.getByLabel("What happened? *").fill("Seller asked to be paid to a relative's account");
  await q.getByLabel("Why does it seem suspicious? *").fill("Payment to a third party account");
  await submit(q, "Send report", "Sent to the Compliance Officer");
  await p.goto(BASE + "/app/cases");
  await p.getByRole("link", { name: "Internal suspicion report" }).first().click();
  await p.waitForURL(/\/app\/cases\/[0-9a-f-]{36}$/);
  await p.getByRole("radio", { name: /no grounds for suspicion/ }).check();
  await p.getByLabel("Reasons *").fill("Relative is the co-owner on the title deed; documented, no grounds for suspicion.");
  await submit(p, "Record decision", "Case · decided · decision: no-report");
  await p.goto(BASE + "/app/cases");
  if (!(await p.getByText("decided (no-report)").count())) throw new Error("no-report not kept");
  log("'no report' decision kept in the case list");

  console.log("page errors:", errors);
  await b.close();
})().catch((e) => { console.error("✘", e.message); process.exit(1); });
