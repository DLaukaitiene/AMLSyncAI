/* eslint-disable @typescript-eslint/no-require-imports */
// Cancellation → read-only archive + full export. CODE=… node e2e/archive-flow.cjs
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const { unzipSync } = require("fflate");
const fs = require("fs");
const { BASE, log, signupFirm, submit } = require("./helpers.cjs");
const sql = (q) => execSync(`psql -At "${process.env.DATABASE_URL}"`, { input: q }).toString().trim();

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const { p } = await signupFirm(b, { code: process.env.CODE, company: "Archyvas UAB", email: "owner@archyvas.lt", sector: "ACCOUNTANT" });
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(BASE + "/app/clients/new");
  await p.getByLabel("First names (all) *").fill("Jonas"); await p.getByLabel("Surname *").fill("Archyvinis");
  await p.getByRole("button", { name: "Create client" }).click();
  await p.getByRole("heading", { name: "Jonas Archyvinis" }).waitFor();
  const fileUrl = p.url();

  await p.goto(BASE + "/app/billing");
  const [dl] = await Promise.all([p.waitForEvent("download"), p.getByRole("link", { name: "Download full export" }).click()]);
  const zip = unzipSync(fs.readFileSync(await dl.path()));
  const names = Object.keys(zip);
  if (!names.some((n) => n.startsWith("firm/")) || !names.some((n) => /^clients\/Jonas_Archyvinis-/.test(n))) throw new Error("✘ export contents: " + names.join(", "));
  log("full export: firm file + one ZIP per client");

  await p.getByText("End my subscription").click();
  await p.getByLabel("Type CANCEL to confirm").fill("cancel");
  await submit(p, "End subscription", "Type CANCEL to confirm");
  await p.getByLabel("Type CANCEL to confirm").fill("CANCEL");
  await p.getByRole("button", { name: "End subscription", exact: true }).click();
  await p.getByRole("heading", { name: "Read-only archive" }).waitFor();
  const until = sql(`SELECT "archiveUntil" FROM "Firm" WHERE name = 'Archyvas UAB'`);
  if (!/^20(3[0-9])-/.test(until)) throw new Error("✘ archiveUntil " + until);
  log(`cancelled: read-only archive until ${until}`);

  await p.goto(fileUrl);
  await p.getByRole("heading", { name: "Jonas Archyvinis" }).waitFor();
  await p.getByText(/Subscription ended — read-only archive until/).waitFor();
  log("client files still open, with the archive banner");
  await p.goto(BASE + "/app/clients/new");
  await p.getByLabel("First names (all) *").fill("Naujas"); await p.getByLabel("Surname *").fill("Klientas");
  await p.getByRole("button", { name: "Create client" }).click();
  await p.getByRole("heading", { name: "Read-only archive" }).waitFor();
  if (sql(`SELECT count(*) FROM "Party" WHERE "displayName" = 'Naujas Klientas'`) !== "0") throw new Error("✘ write went through");
  log("changes refused: nothing is written in the archive");
  console.log("page errors:", errors);
  await b.close();
})().catch((e) => { console.log("✘", e.message); process.exit(1); });
