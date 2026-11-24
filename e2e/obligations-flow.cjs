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

  // Obligations on the dashboard: open duties first, settled ones folded away
  const obl = p.getByTestId("obligations");
  for (const t of ["Appoint a Compliance Officer", "Assess your firm's risks", "Check every client before you start", "Train your staff every year"]) await obl.getByText(t, { exact: true }).waitFor();
  await p.getByTestId("attention").waitFor();
  for (const box of ["Your company", "Your team", "Clients", "Deals and transactions", "Reporting"]) await p.getByTestId(`box-${box}`).waitFor();
  await p.getByTestId("obligation-staff-integrity").getByText("Not needed for a one-person firm.").waitFor();
  if ((await p.getByTestId("obligation-staff-integrity").getAttribute("data-state")) !== "na") throw new Error("✘ staff integrity should be 'not needed'");
  await p.getByTestId("obligation-risk-assessment").locator("summary").click();
  await p.getByTestId("obligation-risk-assessment").getByText(/Once at the start, then review at least every year/).waitFor();
  log("dashboard: 5 boxes (company, team, clients, deals, reporting); (?) opens the explanation; status per duty");

  // Appoint the Compliance Officer from the box (fresh sign-in, so no step-up needed)
  const co = p.getByTestId("obligation-compliance-officer");
  await co.getByText("Nobody is appointed yet.").waitFor();
  await co.getByLabel("Compliance Officer", { exact: true }).selectOption({ label: "Owner of Pareigos UAB" });
  await co.getByRole("button", { name: "Appoint" }).first().click();
  await p.reload();
  await p.getByTestId("obligation-compliance-officer").getByText(/Responsible manager: Owner of Pareigos UAB|Compliance Officer: Owner of Pareigos UAB/).waitFor();
  log("Compliance Officer appointed from the dashboard box; the name shows");
  await p.getByTestId("obligation-compliance-officer").getByRole("link", { name: /Roles and duties/ }).click();
  await p.getByRole("heading", { name: "Roles and duties" }).waitFor();
  await p.getByTestId("duty-note").getByText(/must have a named Compliance Officer/).waitFor();
  log("button leads to Roles and duties, with the duty explained on the page");

  // Explainer page
  await p.goto(BASE + "/app");
  await p.getByTestId("obligation-reporting").locator("summary").click();
  await p.getByTestId("obligation-reporting").getByRole("link", { name: "How to do it, step by step" }).click();
  await p.waitForURL(/\/app\/obligations#reporting/);
  await p.getByTestId("reporting-guide").getByText(/Never tell the client/).waitFor();
  await p.getByTestId("reporting-guide").getByText(/not recorded yet/).waitFor();
  if ((await p.getByTestId("obligation-explained").count()) !== 14) throw new Error("✘ expected 14 obligations explained");
  await p.getByText(/check both the buyer and the seller/).first().waitFor();
  log("My Obligations: every duty explained, with sector notes; reporting shows warning signs, deadlines and the missing FIU details");

  // Duty notes on working pages
  for (const [path, re] of [["/app/clients", /No client is taken on/], ["/app/transactions", /cash of €10,000 or more is not allowed/], ["/app/cases", /Tell the Compliance Officer now/], ["/app/monitoring-alerts", /stop, freeze, notify/]]) {
    await p.goto(BASE + path);
    await p.getByTestId("duty-note").getByText(re).waitFor();
  }
  log("'Your duty' notes on Clients, Transaction Monitoring, FIU Reporting and Monitoring Alerts");

  // News consent, email settings, summary email
  await p.goto(BASE + "/app");
  await p.getByTestId("news-consent").getByRole("button", { name: "Yes, keep me informed" }).click();
  await p.reload();
  if (await p.getByTestId("news-consent").count()) throw new Error("✘ consent question should not show again");
  await p.goto(BASE + "/app/settings/email");
  await p.getByLabel("Email me about new AML rules", { exact: false }).isChecked().then((c) => { if (!c) throw new Error("✘ consent not recorded"); });
  await p.getByLabel("Every month (1st)").check();
  await submit(p, "Save email settings", "Email settings saved.");
  await submit(p, "Send me the summary now", "Summary sent to owner@pareigos.lt");
  const { execSync } = require("child_process");
  const subj = execSync(`psql -At "${process.env.DATABASE_URL}"`, { input: `SELECT subject FROM "DevEmail" WHERE "to" = 'owner@pareigos.lt' AND subject LIKE '%AMLSync App:%' ORDER BY "createdAt" DESC LIMIT 1` }).toString().trim();
  if (!/obligation|summary/.test(subj)) throw new Error("✘ summary email: " + subj);
  log("news consent asked once and recorded; email settings saved; compliance summary email sent");

  // Sample data: load, look, remove
  await p.goto(BASE + "/app");
  await submit(p, "Load sample data", "Sample data loaded");
  await p.goto(BASE + "/app/clients");
  if ((await p.getByTestId("client-row").count()) !== 3) throw new Error("✘ expected 3 sample clients");
  await p.goto(BASE + "/app/transactions?status=flagged");
  if ((await p.getByTestId("transaction").count()) < 2) throw new Error("✘ sample payments should raise flags");
  await p.goto(BASE + "/app");
  await p.getByTestId("sample-data").getByText("Sample data is loaded.").waitFor();
  execSync(`psql -q "${process.env.DATABASE_URL}"`, { input: `UPDATE "CddFile" SET status = 'EDD', "nextRefreshOn" = now() - interval '3 days' WHERE id = (SELECT f.id FROM "CddFile" f JOIN "Party" p ON p.id = f."partyId" WHERE p."displayName" LIKE 'Jonas Ministras%' LIMIT 1)` });
  await p.reload();
  await p.getByTestId("attention").getByText(/Jonas Ministras.*client review overdue since .* \(high risk: yearly\)/).waitFor();
  log("overdue client review listed under 'Needs your attention', with the yearly / 5-year rule");
  await submit(p, "Remove sample data", "Sample data removed (4 people and companies)");
  await p.goto(BASE + "/app/clients");
  if (await p.getByTestId("client-row").count()) throw new Error("✘ sample clients not removed");
  log("sample data: loaded (3 clients, flagged payments) and removed in one click");

  console.log("page errors:", errors);
  await b.close();
  if (errors.length) process.exit(1);
})().catch((e) => { console.error("✘", e.message); process.exit(1); });
