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
  await p.getByLabel("Email").fill("petras@example.lt");
  await p.getByRole("button", { name: "Create client" }).click();
  await p.getByRole("heading", { name: "Petras Ginčas" }).waitFor();
  const { execSync } = require("child_process");
  const mails = execSync(`psql -At "${process.env.DATABASE_URL}"`, { input: `SELECT count(*) FROM "DevEmail" WHERE "to" = 'petras@example.lt'` }).toString().trim();
  if (mails !== "1") throw new Error("✘ secure link not sent on create: " + mails);
  log("client created with an email: secure link sent straight away");
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
  // Ownership tracing per branch
  await p.locator("select[name=defaultCddScope]").count(); // (firm default stays identification-only; switch this client to full)
  await p.goto(BASE + "/app/clients/new");
  await p.getByLabel("Company", { exact: true }).check();
  await p.getByLabel("Legal name *").fill("Šakos UAB");
  await p.getByRole("button", { name: "Create client" }).click();
  await p.getByRole("heading", { name: "Šakos UAB" }).waitFor();
  await p.getByRole("button", { name: "Switch to full due diligence", exact: true }).click();
  await p.getByText("Full due diligence (AMLR).").first().waitFor();
  const addOwner = async (fill) => {
    await p.getByText("Add a shareholder or controller").click();
    const f = p.locator("details", { hasText: "Add a shareholder or controller" });
    await fill(f);
    await f.getByRole("button", { name: "Add", exact: true }).click();
    await p.getByText("Added. Beneficial owners and screening were updated.").first().waitFor();
    await p.reload();
  };
  await addOwner(async (f) => { await f.getByLabel("% held").fill("30"); await f.getByLabel("Company / legal entity").check(); await f.getByLabel("Legal name *").fill("Holdingas SIA"); });
  await addOwner(async (f) => { await f.getByLabel("% held").fill("50"); await f.getByLabel("First names (all) *").fill("Rūta"); await f.getByLabel("Surname *").fill("Savininkė"); });
  const br = p.getByTestId("ownership-branches");
  const t1 = await br.innerText();
  if (!/2 open branch\(es\), 50% of the client/.test(t1) || !/Holdingas SIA · no owners recorded · 30% of the client/.test(t1) || !/20% of its shares not accounted for/.test(t1)) throw new Error("✘ branches: " + t1);
  if (!(await p.getByText("Identify the beneficial owners or record the senior managing officials.").count())) throw new Error("✘ BO gate missing");
  log("open branches shown with their share: Holdingas SIA 30% (no owners), 20% unaccounted; beneficial owners not resolved");
  const row = br.locator("li", { hasText: "Holdingas SIA" });
  await row.getByText("No further look-through needed").click();
  await row.locator("select[name=reason]").selectOption("listed");
  await row.locator("input[name=note]").fill("Listed on Nasdaq Riga");
  await row.getByRole("button", { name: "Close branch" }).click();
  await br.getByText(/all branches closed/).waitFor();
  const t2 = await br.innerText();
  if (!/Closed: Listed on an EU regulated market/.test(t2) || !/Closed: open branches together are below 25%/.test(t2)) throw new Error("✘ after close: " + t2);
  if (await p.getByText("Identify the beneficial owners or record the senior managing officials.").count()) throw new Error("✘ BO gate still open");
  log("listed holding closed with a reason; the remaining 20% closes automatically (can't reach 25%); beneficial owner Rūta Savininkė resolved");
  console.log("page errors:", errors);
  await b.close();
})().catch((e) => { console.log("✘", e.message); process.exit(1); });
