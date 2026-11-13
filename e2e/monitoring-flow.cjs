/* eslint-disable @typescript-eslint/no-require-imports */
// Monitoring and refresh (spec §4.5, §4A.5, §11.8–11.9).   CODE=… CRON_SECRET=… DATABASE_URL=… node e2e/monitoring-flow.cjs
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const { BASE, log, signupFirm, submit } = require("./helpers.cjs");
const sql = (q) => execSync(`psql "${process.env.DATABASE_URL}" -tAc ${JSON.stringify(q)}`).toString().trim();

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const { p } = await signupFirm(b, { code: process.env.CODE, company: "Stebėsena UAB", email: "owner@stebesena.lt", sector: "ACCOUNTANT" });
  p.on("pageerror", (e) => errors.push(e.message));

  // Accepted client with email
  await p.goto(BASE + "/app/clients/new");
  await p.getByLabel("First names (all) *").fill("Rūta"); await p.getByLabel("Surname *").fill("Klientė");
  await p.getByLabel("Email").fill("ruta@example.lt");
  await p.getByLabel("Purpose and intended nature of the relationship").fill("Personal tax returns");
  await p.getByRole("button", { name: "Create client" }).click();
  await p.getByRole("heading", { name: "Rūta Klientė" }).waitFor();
  const fileUrl = p.url();
  const fileId = fileUrl.split("/").pop();
  await p.locator("select[name=method]").selectOption("IN_PERSON");
  await p.getByLabel("Document type").fill("ID card"); await p.getByLabel("Document number").fill("AB1234567");
  await p.getByLabel("Why national eID wasn't used").fill("Met the client in the office");
  await submit(p, "Record verification", "Identity verification recorded.");
  await p.reload();
  await submit(p, "Accept client", /Accepted · Risk/);

  // Refresh due in 10 days → cron sends a refresh link
  sql(`UPDATE "CddFile" SET "nextRefreshOn" = (now() + interval '10 days')::date WHERE id = '${fileId}'`);
  const res = await (await b.newContext()).request.post(BASE + "/api/cron/refresh", { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
  const body = await res.json();
  if (body.sent !== 1) throw new Error("cron: " + JSON.stringify(body));
  log("refresh job: link sent to the client", JSON.stringify(body));
  const bad = await (await b.newContext()).request.post(BASE + "/api/cron/refresh", { headers: { Authorization: "Bearer wrong" } });
  if (bad.status() !== 401) throw new Error("cron auth");

  // Client confirms nothing changed
  const c = await (await b.newContext()).newPage();
  await c.goto(BASE + "/dev/mailbox");
  const link = (await c.locator('article[data-to="ruta@example.lt"] pre').first().innerText()).match(/http\S+/)[0];
  await c.goto(link);
  await submit(c, "Send me a code", "We've sent a 6-digit code");
  await c.goto(BASE + "/dev/mailbox");
  const code = (await c.locator('article[data-to="ruta@example.lt"] pre').first().innerText()).match(/\b\d{6}\b/)[0];
  await c.goto(link);
  await c.getByLabel("6-digit code *").fill(code);
  await c.getByRole("button", { name: "Continue" }).click();
  await c.getByRole("heading", { name: "Has anything changed?" }).waitFor();
  await c.getByLabel(/Nothing has changed since I last gave/).check();
  await c.getByLabel("Type your full name to confirm").fill("Rūta Klientė");
  await c.getByRole("button", { name: "Confirm nothing has changed" }).click();
  await c.getByRole("heading", { name: "Thank you" }).waitFor();
  await p.goto(fileUrl);
  const head = await p.locator("main p").nth(1).innerText();
  if (!/Next refresh 2031/.test(head)) throw new Error("not renewed: " + head);
  log("client confirmed nothing changed; clean screening → renewed automatically:", head);

  // Russia: services to a Russian-established company are blocked, even with an override
  await p.goto(BASE + "/app/clients/new");
  await p.getByLabel("Company / legal entity").check();
  await p.getByLabel("Legal name *").fill("Moskva Trading OOO");
  await p.getByLabel("Country of creation").fill("RU");
  await p.getByLabel("Purpose and intended nature of the relationship").fill("Bookkeeping");
  await p.getByRole("button", { name: "Create client" }).click();
  await p.getByRole("heading", { name: "Moskva Trading OOO" }).waitFor();
  await p.getByText(/entities established in Russia are prohibited/).first().waitFor();
  await p.getByLabel(/Override open items/).fill("Long-standing client, small fees");
  await submit(p, "Accept client", /Cannot be overridden/);
  log("Russia rule pack: service to a Russian-established entity blocked, override refused");

  // Per-matter monitoring
  const matter = async (title, price) => {
    await p.goto(BASE + "/app/matters/new");
    await p.getByLabel("Title *").fill(title);
    await p.getByLabel("Price (EUR)").fill(String(price));
    await p.getByRole("button", { name: "Create matter" }).click();
    await p.getByRole("heading", { name: title }).waitFor();
    await p.getByText("Add a party").click();
    const d = p.locator("details", { hasText: "Add a party" });
    await d.locator("select[name=existingPartyId]").selectOption({ label: "Rūta Klientė" });
    await d.getByRole("button", { name: "Add party" }).click();
    return p.getByText(/Party added\./).first().innerText();
  };
  await matter("2026 tax return", 2000);
  const msg = await matter("Advice on sale of company", 250000);
  if (!/Review needed: value €250,000 is more than twice/.test(msg)) throw new Error("no review: " + msg);
  log("new matter far above the client's profile → review:", msg);

  console.log("page errors:", errors);
  await b.close();
})().catch((e) => { console.error("✘", e.message); process.exit(1); });
