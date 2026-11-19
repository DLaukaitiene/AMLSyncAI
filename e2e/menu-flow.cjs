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
  for (const label of ["Dashboard", "Clients", "Identity Verification", "Risk Assessments", "Monitoring Alerts", "FIU Reporting", "Reports", "Audit Trail", "Compliance Hub", "My Compliance", "Team", "Settings", "Help Centre"]) {
    await nav.getByText(label, { exact: true }).first().waitFor();
  }
  log("menu shows the ClearAML-style sections");
  for (const card of ["Total Clients", "Pending Reviews", "Open Alerts", "High Risk Clients"]) await p.getByText(card, { exact: true }).waitFor();
  log("dashboard metric cards");

  // A client whose name is on the TEST list → an open alert
  await p.goto(BASE + "/app/clients/new");
  await p.getByRole("heading", { name: "Add Client" }).waitFor();
  await p.getByLabel("First names (all) *").fill("Viktor");
  await p.getByLabel("Surname *").fill("Malenko");
  await p.getByLabel("Date of birth").fill("1971-03-03");
  await p.getByRole("button", { name: "Create client" }).click();
  await p.getByRole("heading", { name: "Viktor Malenko" }).waitFor();

  await p.goto(BASE + "/app/monitoring-alerts");
  await p.getByRole("heading", { name: "Monitoring Alerts" }).waitFor();
  const alert = p.getByTestId("alert").first();
  await alert.getByText("Viktor Malenko · client").waitFor();
  await alert.getByRole("link", { name: "Review" }).click();
  await p.getByRole("heading", { name: "Viktor Malenko" }).waitFor();
  log("Monitoring Alerts lists the possible match and links to the client's screening");

  await p.goto(BASE + "/app/risk-assessments");
  await p.getByRole("heading", { name: "Risk Assessments" }).waitFor();
  await p.getByRole("link", { name: "Viktor Malenko" }).waitFor();
  log("Risk Assessments lists the client with its rating");

  await p.goto(BASE + "/app/identity-verification");
  await p.getByRole("heading", { name: "Identity Verification" }).waitFor();
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
  await p.getByRole("heading", { name: "Reports" }).waitFor();
  const res = await ctx.request.get(BASE + "/api/registers/clients", { maxRedirects: 0 });
  const csv = await res.text();
  if (res.status() !== 200 || !csv.includes("Viktor Malenko") || !csv.includes("Client,Type,Status,Risk")) throw new Error("✘ client register CSV: " + res.status() + " " + csv.slice(0, 200));
  const audit = await (await ctx.request.get(BASE + "/api/registers/audit", { maxRedirects: 0 })).text();
  if (!audit.includes("When (UTC)")) throw new Error("✘ audit CSV");
  const bad = await ctx.request.get(BASE + "/api/registers/nope", { maxRedirects: 0 });
  if (bad.status() !== 404) throw new Error("✘ unknown register should 404");
  log("Reports: Client Register and Audit Trail CSV download; unknown register 404");

  for (const [path, h] of [["/app/cases", "Suspicious Matters"], ["/app/reports", "Report Queue"], ["/app/firm", "Compliance Hub"], ["/app/firm/policies", "AML Program"], ["/app/firm/training", "My Compliance"], ["/app/firm/integrity", "Personnel Due Diligence"], ["/app/support", "Help Centre"], ["/app/security", "Security"]]) {
    await p.goto(BASE + path);
    await p.getByRole("heading", { name: h, exact: true }).first().waitFor();
  }
  log("page headings match the menu");

  const anon = await (await b.newContext()).request.get(BASE + "/api/registers/clients", { maxRedirects: 0 });
  if (anon.status() !== 404) throw new Error("✘ signed-out register export should 404, got " + anon.status());
  log("signed-out register export: 404");
  console.log("page errors:", errors);
  await b.close();
  if (errors.length) process.exit(1);
})().catch((e) => { console.error("✘", e.message); process.exit(1); });
