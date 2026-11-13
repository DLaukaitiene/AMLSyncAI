/* eslint-disable @typescript-eslint/no-require-imports */
// Governance, training, integrity, whistleblowing, outsourcing, annual report, supervisor files (spec §4.1, §4.7, §11.1, §11.11).
//   CODE=… node e2e/governance-flow.cjs
const { chromium } = require("playwright");
const fs = require("fs");
const { unzipSync, strFromU8 } = require("fflate");
const { BASE, log, signupFirm, submit, lastMail, totp } = require("./helpers.cjs");

const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000" + "1f15c4890000000d49444154789c6360000002000100e221bc330000000049454e44ae426082", "hex");

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const { p } = await signupFirm(b, { code: process.env.CODE, company: "Teisė ir apskaita UAB", email: "owner@teise.lt", sector: "ACCOUNTANT" });
  p.on("pageerror", (e) => errors.push(e.message));

  // One-person firm: Art. 13/14 hidden with reason
  await p.goto(BASE + "/app/firm/whistleblowing"); await p.getByText(/not needed in a one-person firm/).waitFor();
  await p.goto(BASE + "/app/firm/integrity"); await p.getByText(/don't apply to a one-person firm/).waitFor();
  log("one-person firm: whistleblowing and integrity hidden with the reason");

  // Invite Bob
  await p.goto(BASE + "/app/team");
  await p.getByLabel("Name *").fill("Bob Buhalteris"); await p.getByLabel("Email *").fill("bob@teise.lt");
  await submit(p, "Send invitation", "Invitation sent");
  const q = await (await b.newContext()).newPage();
  q.on("pageerror", (e) => errors.push(e.message));
  await q.goto(await lastMail(q, "bob@teise.lt"));
  await q.getByLabel("Choose a password *").fill("another long passphrase 42");
  await q.getByRole("button", { name: "Accept invitation" }).click();
  await q.getByRole("heading", { name: "Set up two-factor authentication" }).waitFor();
  await q.getByText("Can't scan?").click();
  const bs = (await q.locator("details code").innerText()).replace(/\s/g, "");
  await q.getByLabel("6-digit code").fill(totp(bs)); await q.getByRole("button", { name: /Turn on/ }).click();
  await q.getByTestId("recovery-codes").waitFor(); await q.getByRole("link", { name: /continue/ }).click();
  await q.getByRole("heading", { name: "Dashboard" }).waitFor();

  // Integrity declaration by Bob
  await q.goto(BASE + "/app/firm/integrity");
  for (const n of ["convictions", "aml-sanctions", "pep"]) await q.locator(`input[name=${n}][value=no]`).check();
  await q.locator("input[name=understood][value=yes]").check();
  await q.getByLabel(/Conflicts of interest/).fill("My brother is a director of client Baltic Trade UAB");
  await submit(q, "Make declaration", "The Compliance Officer will follow up");
  await p.goto(BASE + "/app/firm/integrity"); await p.getByText(/conflict: My brother/).waitFor();
  log("integrity declaration with a conflict is flagged to the CO");

  // Anonymous whistleblowing
  await q.goto(BASE + "/app/firm/whistleblowing");
  await q.getByLabel("What do you want to report?", { exact: true }).fill("A colleague accepted €15,000 in cash from a client last week without recording it.");
  await submit(q, "Send report", "acknowledged within 7 days");
  if ((await q.goto(BASE + "/app/firm/whistleblowing")) && (await q.getByText("Received reports").count())) throw new Error("staff sees reports");
  await p.goto(BASE + "/app/firm/whistleblowing");
  await p.getByText("A colleague accepted €15,000").waitFor();
  if (!(await p.getByText("anonymous · received").count())) throw new Error("not anonymous");
  await submit(p, "Acknowledge", /anonymous · acknowledged/);
  log("anonymous whistleblowing report received and acknowledged; staff can't see reports");

  // Training
  await p.goto(BASE + "/app/firm/training");
  await submit(p, "Assign", "Training assigned");
  await q.goto(BASE + "/app/firm/training");
  await q.getByLabel("I completed this training and understood it").check();
  await submit(q, "Complete", /completed \d{4}/);
  log("training assigned and completed with attestation");

  // Outsourcing without notice → draft supervisor notice
  await p.goto(BASE + "/app/firm/outsourcing");
  await p.getByLabel("Provider *").fill("AMLSync UAB");
  await p.getByLabel("Tasks outsourced *").fill("Review of screening hits and EDD memo preparation");
  await submit(p, "Add", "a draft notice is in Reports");
  log("outsourcing added; supervisor notice drafted");

  // Appoint Bob as compliance officer → removal notice for the previous officer
  await p.goto(BASE + "/app/firm/governance");
  const co = p.locator("section", { hasText: "Compliance officer" }).last();
  await co.locator("select[name=userId]").selectOption({ label: "Bob Buhalteris" });
  await co.getByLabel("Reason for the change").fill("Workload: owner hands over the function");
  await co.getByRole("button", { name: "Appoint" }).click();
  await p.getByText(/Bob Buhalteris since/).waitFor();
  await p.goto(BASE + "/app/reports");
  if ((await p.getByText("Notice to supervisor").count()) < 2) throw new Error("expected 2 supervisor notices");
  log("officer change recorded; removal notice drafted (Reports has 2 supervisor notices)");

  // Annual report
  await p.goto(BASE + "/app/firm/governance");
  await submit(p, "Generate from system data", /Draft v1/);
  const ar = await p.locator("article").first().innerText();
  if (!/Training completed\s*1 of 2|1 of 2/.test(ar) && !/Training completion/.test(ar)) log("annual report training line:", ar.match(/Training[^\n]*/g));
  await submit(p, "Approve (compliance manager)", /Approved v1/);
  log("annual report generated from data and approved");

  // Client with a document → client supervisor file
  await p.goto(BASE + "/app/clients/new");
  await p.getByLabel("First names (all) *").fill("Jonas"); await p.getByLabel("Surname *").fill("Klientas");
  await p.getByRole("button", { name: "Create client" }).click();
  await p.getByRole("heading", { name: "Jonas Klientas" }).waitFor();
  fs.writeFileSync("/tmp/id-card.png", PNG);
  await p.locator("select[name=kind]").selectOption("id");
  await p.locator("input[type=file]").setInputFiles("/tmp/id-card.png");
  await submit(p, "Upload", "Uploaded.");
  const [dl] = await Promise.all([p.waitForEvent("download"), p.getByRole("link", { name: /Download supervisor file/ }).click()]);
  const zip = unzipSync(fs.readFileSync(await dl.path()));
  const names = Object.keys(zip);
  if (!names.includes("summary.pdf") || !names.includes("data.json") || !names.some((n) => n.startsWith("documents/id-"))) throw new Error("client zip: " + names);
  if (!Buffer.from(zip[names.find((n) => n.startsWith("documents/"))]).equals(PNG)) throw new Error("document differs");
  const data = JSON.parse(strFromU8(zip["data.json"]));
  if (JSON.stringify(data).includes("nationalIdEnc\":{")) throw new Error("encrypted blobs leaked");
  log("client supervisor file:", names.join(", "));

  // Firm supervisor file
  const [dl2] = await Promise.all([p.waitForEvent("download"), (async () => { await p.goto(BASE + "/app/firm"); await p.getByRole("link", { name: "Download the firm supervisor file" }).click(); })()]);
  const fz = Object.keys(unzipSync(fs.readFileSync(await dl2.path())));
  if (!fz.includes("firm-summary.pdf") || !fz.includes("annual-report-v1.pdf")) throw new Error("firm zip: " + fz);
  log("firm supervisor file:", fz.join(", "));
  await p.goto(BASE + "/dev/mailbox");
  await p.getByText("AMLSyncAI: supervisor file exported").first().waitFor();
  log("Owner notified of the export");

  // Signed-out request can't export
  const r = await (await b.newContext()).request.get(BASE + "/api/supervisor-file/firm", { maxRedirects: 0 });
  if (r.status() !== 404) throw new Error("anonymous export status " + r.status());
  log("signed-out export request: 404");

  console.log("page errors:", errors);
  await b.close();
})().catch((e) => { console.error("✘", e.message); process.exit(1); });
