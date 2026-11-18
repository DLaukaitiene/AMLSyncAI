/* eslint-disable @typescript-eslint/no-require-imports */
// Identification-only scope (service outside AMLR): CODE=… node e2e/scope-flow.cjs
const { chromium } = require("playwright");
const { BASE, log, signupFirm, submit } = require("./helpers.cjs");

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const { p } = await signupFirm(b, { code: process.env.CODE, company: "Teisininkai ir Ko", email: "owner@teisininkai.lt", sector: "LEGAL" });
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(BASE + "/app/clients/new");
  await p.getByLabel("First names (all) *").fill("Petras");
  await p.getByLabel("Surname *").fill("Ginčas");
  await p.getByLabel("Date of birth").fill("1980-02-02");
  await p.getByRole("button", { name: "Create client" }).click();
  await p.getByRole("heading", { name: "Petras Ginčas" }).waitFor();
  await p.getByRole("button", { name: "Accept client", exact: true }).click();
  await p.getByText(/Can't accept yet/).first().waitFor();
  log("full due diligence: can't accept without verification and purpose");

  await p.getByText("Record as identification only (outside AMLR scope)").click();
  await p.locator("select[name=scopeReason]").selectOption("legal-proceedings");
  await p.locator("input[name=scopeNote]").fill("Defence in a civil court case");
  await p.getByRole("button", { name: "Record as identification only", exact: true }).click();
  await p.getByText("Identification only", { exact: true }).first().waitFor();
  await submit(p, "Accept client", /Accepted/);
  log("identification only (court proceedings): accepted after identification and screening, no verification needed");

  await p.getByRole("button", { name: "Switch to full due diligence", exact: true }).click();
  await p.getByText("Full due diligence (AMLR).", { exact: false }).first().waitFor();
  await p.getByRole("button", { name: "Accept client", exact: true }).waitFor();
  log("switched to full due diligence: the file reopens until full CDD is done");

  await p.goto(BASE + "/app/firm");
  await p.locator("select[name=defaultCddScope]").selectOption("identification-only");
  await submit(p, "Save default", "New clients start as identification only");
  await p.goto(BASE + "/app/clients/new");
  await p.getByLabel("First names (all) *").fill("Ona"); await p.getByLabel("Surname *").fill("Naujoji");
  await p.getByRole("button", { name: "Create client" }).click();
  await p.getByRole("heading", { name: "Ona Naujoji" }).waitFor();
  await p.getByText(/Firm default: our services to new clients are outside AMLR scope/).first().waitFor();
  log("firm default: new clients start as identification only");
  console.log("page errors:", errors);
  await b.close();
})().catch((e) => { console.log("✘", e.message); process.exit(1); });
