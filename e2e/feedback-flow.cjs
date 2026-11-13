/* eslint-disable @typescript-eslint/no-require-imports */
// Feature requests (spec §4.10, §11.13). Server must run with PLATFORM_ADMIN_EMAILS=triage@amlsyncai-team.lt
//   CODE1=… CODE2=… CODE3=… node e2e/feedback-flow.cjs
const { chromium } = require("playwright");
const { BASE, log, signupFirm, submit } = require("./helpers.cjs");

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const { p: a } = await signupFirm(b, { code: process.env.CODE1, company: "Alfa Apskaita UAB", email: "anna@alfa.lt", sector: "ACCOUNTANT" });
  const { p: bb } = await signupFirm(b, { code: process.env.CODE2, company: "Beta Namai UAB", email: "bob@beta.lt", sector: "ESTATE_AGENT" });
  const { p: t } = await signupFirm(b, { code: process.env.CODE3, company: "AMLSyncAI Team", email: "triage@amlsyncai-team.lt", sector: "OTHER" });
  for (const x of [a, bb, t]) x.on("pageerror", (e) => errors.push(e.message));

  // "Suggest a feature" on every screen, module pre-filled
  await a.goto(BASE + "/app/clients");
  await a.getByRole("link", { name: "Suggest a feature" }).click();
  await a.getByRole("heading", { name: "Suggest a feature" }).waitFor();
  if ((await a.getByLabel("Module").inputValue()) !== "Clients and CDD") throw new Error("module not prefilled");
  log("button on the Clients page pre-fills module 'Clients and CDD'");
  await a.getByLabel("Title *").fill("Export the compliance calendar to Outlook");
  await a.getByLabel("What problem does it solve? *").fill("We re-type deadlines. Contact jonas@client.lt about it.");
  await submit(a, "Submit request", "This looks like personal data (email)");
  log("personal data detected and blocked");
  await a.getByLabel("What problem does it solve? *").fill("We re-type every deadline into Outlook by hand each week.");
  await a.getByRole("button", { name: "Submit request" }).click();
  await a.getByRole("heading", { name: "Export the compliance calendar to Outlook" }).waitFor();
  const reqUrl = a.url();

  // Other firm sees similar requests while typing and votes; firm name hidden
  await bb.goto(BASE + "/app/feature-requests/new");
  await bb.getByLabel("Title *").fill("calendar export");
  await bb.getByTestId("similar").getByText("Export the compliance calendar to Outlook").waitFor();
  await bb.getByTestId("similar").getByRole("button", { name: "Vote" }).first().click();
  await bb.getByText("Vote added.").waitFor();
  log("similar request shown while typing; voted instead of creating a duplicate");
  await bb.goto(reqUrl);
  await bb.getByText("You voted for this.").waitFor();
  const page = await bb.locator("main").innerText();
  if (page.includes("Alfa")) throw new Error("firm name leaked");
  await bb.goto(BASE + "/app/feature-requests/new");
  await bb.getByLabel("Title *").fill("calendar export");
  await bb.getByTestId("similar").getByRole("button", { name: "Vote" }).first().click();
  await bb.getByText("You have already voted for this request.").waitFor();
  log("one vote per user; other firm's name is never shown");

  // Regulatory request
  await bb.goto(BASE + "/app/feature-requests/new");
  await bb.getByLabel("Title *").fill("Lithuanian cash report to FNTT in XML");
  await bb.getByLabel("What problem does it solve? *").fill("FNTT expects the cash transaction report in its XML format.");
  await bb.getByLabel("This is required by law in my country").check();
  await bb.getByLabel("Legal reference (if required by law)").fill("LT AML law art. 20");
  await bb.getByRole("button", { name: "Submit request" }).click();
  await bb.getByRole("heading", { name: "Lithuanian cash report to FNTT in XML" }).waitFor();

  // Rate limit: 10 per user per day
  for (let i = 2; i <= 10; i++) {
    await a.goto(BASE + "/app/feature-requests/new");
    await a.getByLabel("Title *").fill(`Unique request number ${i} about reports zz${i}`);
    await a.getByLabel("What problem does it solve? *").fill("A description long enough to pass the check.");
    await a.getByRole("button", { name: "Submit request" }).click();
    await a.waitForURL(/feature-requests\/[0-9a-f-]{36}$/);
  }
  await a.goto(BASE + "/app/feature-requests/new");
  await a.getByLabel("Title *").fill("Eleventh request today");
  await a.getByLabel("What problem does it solve? *").fill("A description long enough to pass the check.");
  await submit(a, "Submit request", "You can submit up to 10 requests a day");
  log("11th request in a day refused");

  // Triage: regulatory first, status rules, notifications, merge
  await t.goto(BASE + "/admin/feature-requests");
  const first = await t.getByTestId("triage-row").first().innerText();
  if (!/regulatory/.test(first) || !/FNTT/.test(first)) throw new Error("regulatory not first: " + first);
  if (/Beta Namai|Alfa Apskaita/.test(await t.locator("main").innerText())) throw new Error("firm names in triage");
  log("triage: regulatory request at the top; no firm names");
  const row = t.getByTestId("triage-row").filter({ has: t.getByRole("link", { name: "Export the compliance calendar to Outlook" }) });
  await row.getByText("Manage").click();
  await row.locator("select[name=status]").selectOption("NOT_PLANNED");
  await row.getByRole("button", { name: "Update status" }).click();
  await t.getByText("Give a reason when a request is not planned.").first().waitFor();
  await row.locator("select[name=status]").selectOption("PLANNED");
  await row.getByRole("button", { name: "Update status" }).click();
  await t.getByText(/2 person\(s\) notified/).first().waitFor();
  log("'Not planned' needs a reason; 'Planned' notified requester and voter");
  await t.goto(BASE + "/dev/mailbox");
  for (const who of ["anna@alfa.lt", "bob@beta.lt"]) await t.locator(`article[data-to="${who}"]`, { hasText: "Feature request: Planned" }).first().waitFor();
  await t.goto(BASE + "/admin/feature-requests");
  const dup = t.getByTestId("triage-row").filter({ has: t.getByRole("link", { name: /Unique request number 2 about/ }) });
  await dup.getByText("Manage").click();
  await dup.locator("select[name=targetId]").selectOption({ label: "Export the compliance calendar to Outlook" });
  await dup.getByRole("button", { name: "Merge duplicate" }).click();
  await dup.waitFor({ state: "detached" });
  await t.goto(reqUrl);
  const meta = await t.locator("main p").first().innerText();
  if (!/2 vote\(s\)/.test(meta)) throw new Error("votes not combined: " + meta);
  log("merged duplicate; votes combined:", meta);

  console.log("page errors:", errors);
  await b.close();
})().catch((e) => { console.error("✘", e.message); process.exit(1); });
