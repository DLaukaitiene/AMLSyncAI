/* eslint-disable @typescript-eslint/no-require-imports */
// Menu (ClearAML-style names) and the list pages behind it: CODE=… node e2e/menu-flow.cjs
const { chromium } = require("playwright");
const { BASE, log, signupFirm } = require("./helpers.cjs");

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const { p, ctx } = await signupFirm(b, { code: process.env.CODE, company: "Meniu UAB", email: "owner@meniu.lt", sector: "ACCOUNTANT" });
  p.on("pageerror", (e) => errors.push(e.message));

  const nav = p.getByRole("navigation", { name: "Main" });
  const top = await nav.locator(":scope > ul > li").allInnerTexts().catch(() => []);
  for (const label of ["Dashboard", "Clients", "Alerts", "Cases & Payments", "Reporting", "Compliance Hub", "Team", "Settings", "Help Centre"]) {
    await nav.getByText(label, { exact: true }).first().waitFor();
  }
  for (const gone of ["Identity Verification", "Risk Assessments", "Monitoring Alerts", "FIU Reporting", "My Compliance", "Feature Requests"]) {
    if (await nav.getByText(gone, { exact: true }).count()) throw new Error("✘ old top-level item still in the menu: " + gone);
  }
  void top;
  log("menu: 9 sections, daily work first (Clients, Alerts, Cases & Payments)");
  for (const card of ["Not yet decided", "Up to date", "Your obligations", "Upcoming deadlines", "Recent clients"]) await p.getByText(card, { exact: true }).first().waitFor();
  await p.getByTestId("metrics").getByText("High risk", { exact: true }).waitFor();
  await p.getByTestId("attention").getByText(/Needs your attention/).waitFor();
  for (const gone of ["Program Status", "Quick Actions", "Activity Feed"]) if (await p.getByText(gone, { exact: true }).count()) throw new Error("✘ dashboard still shows " + gone);
  log("dashboard: key numbers, one attention list, obligations, deadlines, recent clients");

  // A client whose name is on the TEST list → an open alert
  await p.goto(BASE + "/app/clients/new");
  await p.getByRole("heading", { name: "Add Client" }).waitFor();
  await p.getByLabel("First names (all) *").fill("Viktor");
  await p.getByLabel("Surname *").fill("Malenko");
  await p.getByLabel("Date of birth").fill("1971-03-03");
  await p.getByRole("button", { name: "Create client" }).click();
  await p.getByRole("heading", { name: "Viktor Malenko" }).waitFor();

  const fileUrl = p.url();
  await p.getByTestId("action-strip").getByRole("link", { name: "Run Screening" }).waitFor();
  for (const t of ["Overview", "Verification", "Screening results", "Risk reports", "Documents (0)", "Cases (0)", "Activity"]) await p.getByRole("navigation", { name: "Profile tabs" }).getByRole("link", { name: t, exact: true }).waitFor();
  await p.goto(fileUrl + "?tab=risk");
  await p.getByTestId("risk-history").waitFor();
  if (await p.locator("#decision").count()) throw new Error("✘ Risk reports tab should not show the decision card");
  await p.goto(fileUrl + "?tab=screening");
  await p.locator("#screening").waitFor();
  log("client profile: summary header, action strip and tabs (Risk reports shows the history only)");

  await p.goto(BASE + "/app/clients/new");
  await p.getByText("What are you adding?").waitFor();
  await p.getByRole("radio", { name: "Company or other organisation" }).check();
  await p.getByLabel("Legal form").fill("Trust");
  await p.getByLabel("Legal name *").fill("Šeimos fondas");
  await p.getByRole("button", { name: "Create client" }).click();
  await p.getByRole("heading", { name: "Šeimos fondas" }).waitFor();
  await p.getByRole("navigation", { name: "Profile tabs" }).getByRole("link", { name: "Directors / UBOs" }).waitFor();
  log("Add Client: 'What are you adding?' chooser; a trust gets the Directors / UBOs tab");

  await p.goto(BASE + "/app/clients");
  if ((await p.getByTestId("client-row").count()) !== 2) throw new Error("✘ expected 2 client rows");
  await p.locator("select[name=type]").selectOption("entity");
  await p.getByRole("button", { name: "Apply" }).click();
  await p.waitForURL(/type=entity/);
  if ((await p.getByTestId("client-row").count()) !== 1) throw new Error("✘ type filter");
  await p.getByTestId("client-row").getByText("Not checked").waitFor();
  await p.goto(BASE + "/app/clients?status=open&sort=name");
  await p.getByTestId("client-row").filter({ hasText: "Viktor Malenko" }).getByText("Possible match").waitFor();
  log("Clients: type filter, sort, verification and screening columns");

  await p.goto(BASE + "/app/firm/policies");
  await p.getByRole("navigation", { name: "Compliance Hub sections" }).getByRole("link", { name: "Business Risk Assessment" }).waitFor();
  await p.goto(BASE + "/app/billing");
  await p.getByRole("navigation", { name: "Settings sections" }).getByRole("link", { name: "Screening Lists" }).waitFor();
  await p.goto(BASE + "/app/identity-verification");
  await p.getByRole("navigation", { name: "Clients sections" }).getByRole("link", { name: "Risk Ratings" }).waitFor();
  await p.goto(BASE + "/app/firm/whistleblowing");
  await p.getByRole("navigation", { name: "Compliance Hub sections" }).getByRole("link", { name: "Audit Trail" }).waitFor();
  await p.goto(BASE + "/app/support");
  await p.getByRole("navigation", { name: "Help sections" }).getByRole("link", { name: "Feature Requests" }).waitFor();
  log("section tabs on Clients, Compliance Hub, Settings and Help pages, including pages only reached by tabs");

  await p.goto(BASE + "/app/monitoring-alerts");
  await p.getByRole("heading", { name: "Alerts", exact: true }).waitFor();
  const alert = p.getByTestId("alert").first();
  await alert.getByText("Viktor Malenko · client").waitFor();
  await alert.getByRole("link", { name: "Review" }).click();
  await p.getByRole("heading", { name: "Viktor Malenko" }).waitFor();
  log("Monitoring Alerts lists the possible match and links to the client's screening");

  await p.goto(BASE + "/app/risk-assessments");
  await p.getByRole("heading", { name: "Risk Ratings" }).waitFor();
  await p.getByRole("link", { name: "Viktor Malenko" }).waitFor();
  log("Risk Assessments lists the client with its rating");

  await p.goto(BASE + "/app/identity-verification");
  await p.getByRole("heading", { name: "Identity Checks" }).waitFor();
  await p.getByText("No verified identities yet").waitFor();
  log("Identity Verification page (empty state)");

  await p.goto(BASE + "/app/audit-trail");
  await p.getByRole("heading", { name: "Audit Trail" }).waitFor();
  await p.getByRole("cell", { name: /Person \/ entity/ }).first().waitFor();
  await p.locator("select[name=action]").selectOption("create");
  await p.getByRole("button", { name: "Filter" }).click();
  await p.waitForURL(/action=create/);
  log("Audit Trail shows events and filters by action");

  await p.goto(BASE + "/app/registers");
  await p.getByRole("heading", { name: "Registers & Exports" }).waitFor();
  const res = await ctx.request.get(BASE + "/api/registers/clients", { maxRedirects: 0 });
  const csv = await res.text();
  if (res.status() !== 200 || !csv.includes("Viktor Malenko") || !csv.includes("Client,Type,Status,Risk")) throw new Error("✘ client register CSV: " + res.status() + " " + csv.slice(0, 200));
  const audit = await (await ctx.request.get(BASE + "/api/registers/audit", { maxRedirects: 0 })).text();
  if (!audit.includes("When (UTC)")) throw new Error("✘ audit CSV");
  const bad = await ctx.request.get(BASE + "/api/registers/nope", { maxRedirects: 0 });
  if (bad.status() !== 404) throw new Error("✘ unknown register should 404");
  log("Reports: Client Register and Audit Trail CSV download; unknown register 404");

  for (const [path, h] of [["/app/cases", "Investigations"], ["/app/reports", "Report Queue"], ["/app/firm", "Compliance Hub"], ["/app/firm/policies", "AML Program"], ["/app/firm/training", "My Training"], ["/app/firm/integrity", "Staff Checks"], ["/app/support", "Help Centre"], ["/app/security", "Security"]]) {
    await p.goto(BASE + path);
    await p.getByRole("heading", { name: h, exact: true }).first().waitFor();
  }
  log("page headings match the menu");

  await p.goto(BASE + "/app/support");
  await p.getByTestId("help-topics").getByRole("link", { name: "Transaction Monitoring" }).waitFor();
  await p.locator("input[name=q][aria-label=\"Search help articles\"]").fill("crypto");
  await p.getByRole("button", { name: "Search", exact: true }).click();
  await p.getByTestId("help-results").getByRole("link", { name: "Transaction Monitoring" }).click();
  await p.getByRole("heading", { name: "Transaction Monitoring", level: 1 }).waitFor();
  await p.getByText("Tip:").first().waitFor();
  log("Help Centre: topics, search and article pages");

  const anon = await (await b.newContext()).request.get(BASE + "/api/registers/clients", { maxRedirects: 0 });
  if (anon.status() !== 404) throw new Error("✘ signed-out register export should 404, got " + anon.status());
  log("signed-out register export: 404");
  console.log("page errors:", errors);
  await b.close();
  if (errors.length) process.exit(1);
})().catch((e) => { console.error("✘", e.message); process.exit(1); });
