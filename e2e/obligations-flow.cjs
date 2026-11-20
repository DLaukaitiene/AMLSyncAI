/* eslint-disable @typescript-eslint/no-require-imports */
// Obligations dashboard, guide, explainer and duty notes: CODE=… node e2e/obligations-flow.cjs
const { chromium } = require("playwright");
const { BASE, log, signupFirm, submit } = require("./helpers.cjs");

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const { p } = await signupFirm(b, { code: process.env.CODE, company: "Pareigos UAB", email: "owner@pareigos.lt", sector: "ESTATE_AGENT" });
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(BASE + "/app");

  // Guide and obligations on the dashboard
  await p.getByTestId("dashboard-guide").getByText("1. Each box is a legal duty").waitFor();
  const obl = p.getByTestId("obligations");
  for (const t of ["Appoint a Compliance Officer", "Assess your firm's risks", "Check every client before you start", "Report suspicions to the FIU", "Train your staff every year"]) await obl.getByRole("heading", { name: t }).waitFor();
  await p.getByTestId("obligation-staff-integrity").getByText("Not needed for a one-person firm.").waitFor();
  await p.getByTestId("obligation-client-checks").getByText(/check both the buyer and the seller/).waitFor();
  log("dashboard: guide, obligation boxes with status, one-person and estate-agent specifics");

  // Appoint the Compliance Officer from the box (fresh sign-in, so no step-up needed)
  const co = p.getByTestId("obligation-compliance-officer");
  await co.getByText("Nobody is appointed yet.").waitFor();
  await co.getByLabel("Compliance Officer", { exact: true }).selectOption({ label: "Owner of Pareigos UAB" });
  await co.getByRole("button", { name: "Appoint" }).first().click();
  await p.reload();
  await p.getByTestId("obligation-compliance-officer").getByText(/Responsible manager: Owner of Pareigos UAB|Compliance Officer: Owner of Pareigos UAB/).waitFor();
  log("Compliance Officer appointed from the dashboard box; the name shows");
  await p.getByTestId("obligation-compliance-officer").getByRole("link", { name: "Roles and duties" }).click();
  await p.getByRole("heading", { name: "Responsibilities" }).waitFor();
  await p.getByTestId("duty-note").getByText(/must have a named Compliance Officer/).waitFor();
  log("button leads to Roles and duties, with the duty explained on the page");

  // Explainer page
  await p.goto(BASE + "/app");
  await p.getByTestId("obligation-reporting").getByRole("link", { name: "What does this mean?" }).click();
  await p.waitForURL(/\/app\/obligations#reporting/);
  await p.getByTestId("reporting-guide").getByText(/Never tell the client/).waitFor();
  await p.getByTestId("reporting-guide").getByText(/not recorded yet/).waitFor();
  if ((await p.getByTestId("obligation-explained").count()) !== 14) throw new Error("✘ expected 14 obligations explained");
  log("My Obligations: every duty explained; reporting shows warning signs, deadlines and the missing FIU details");

  // Duty notes on working pages
  for (const [path, re] of [["/app/clients", /No client is taken on/], ["/app/transactions", /cash of €10,000 or more is not allowed/], ["/app/cases", /Tell the Compliance Officer now/], ["/app/monitoring-alerts", /stop, freeze, notify/]]) {
    await p.goto(BASE + path);
    await p.getByTestId("duty-note").getByText(re).waitFor();
  }
  log("'Your duty' notes on Clients, Transaction Monitoring, FIU Reporting and Monitoring Alerts");

  // Hide and show the guide
  await p.goto(BASE + "/app");
  await p.getByRole("button", { name: "Hide the guide" }).click();
  await p.getByRole("button", { name: "Show the dashboard guide" }).waitFor();
  await p.reload();
  if (await p.getByTestId("dashboard-guide").count()) throw new Error("✘ guide should stay hidden");
  await p.getByRole("button", { name: "Show the dashboard guide" }).click();
  await p.getByTestId("dashboard-guide").waitFor();
  log("dashboard guide can be hidden (remembered) and shown again");

  console.log("page errors:", errors);
  await b.close();
  if (errors.length) process.exit(1);
})().catch((e) => { console.error("✘", e.message); process.exit(1); });
