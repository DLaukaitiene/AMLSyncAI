/* eslint-disable @typescript-eslint/no-require-imports */
// Firm documents, Responsibilities, Training Register, client bulk actions, risk report PDF: CODE=… node e2e/hub-flow.cjs
const { chromium } = require("playwright");
const { BASE, log, signupFirm, submit } = require("./helpers.cjs");
const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000" + "1f15c4890000000d49444154789c6360000002000100e221bc330000000049454e44ae426082", "hex");

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const { p, ctx } = await signupFirm(b, { code: process.env.CODE, company: "Centras UAB", email: "owner@centras.lt", sector: "ACCOUNTANT" });
  p.on("pageerror", (e) => errors.push(e.message));

  // My Firm Compliance
  await p.goto(BASE + "/app/firm/documents");
  await p.getByRole("heading", { name: "Firm Documents" }).waitFor();
  await p.locator("select[name=kind]").selectOption("firm:approvals");
  await p.locator("input[type=file][name=file]").setInputFiles([{ name: "board-approval.png", mimeType: "image/png", buffer: PNG }]);
  await submit(p, "Upload", "board-approval.png: uploaded");
  await p.reload();
  await p.getByTestId("firm-folder").filter({ hasText: "Approvals & Sign-offs" }).getByRole("link", { name: "board-approval.png" }).waitFor();
  if ((await p.getByTestId("firm-folder").count()) !== 4) throw new Error("✘ the Owner should see all 4 folders");
  log("My Firm Compliance: file uploaded to Approvals & Sign-offs; 4 folders");

  // Responsibilities: now on "Roles and duties" (the old address redirects)
  await p.goto(BASE + "/app/team/responsibilities");
  await p.waitForURL(/\/app\/firm\/governance/);
  // Duties follow the two roles automatically; hand one to a colleague with Reassign.
  await p.getByTestId("duties-covered").waitFor();
  const training = p.getByTestId("responsibility").filter({ hasText: "Staff training" });
  await training.getByText("Reassign").click();
  await training.getByLabel("Reassign: Staff training").selectOption({ label: "Viktor Malenko" });
  await training.getByRole("button", { name: "Save" }).click();
  await training.getByText("Reassigned").waitFor();
  log("Duties: filled in from the roles; training reassigned to a colleague");

  // Training Register
  await p.goto(BASE + "/app/team/training-register");
  await p.locator("summary", { hasText: "Record training" }).click();
  await p.getByLabel("Title *").fill("AMLR changes for accountants");
  await p.getByLabel("Provider").fill("Chamber of Auditors");
  await p.getByLabel("Date *").fill("2026-11-10");
  await p.getByLabel("Duration (minutes) *").fill("90");
  await p.locator("input[name=attendees]").first().check();
  await submit(p, "Record training", "Training recorded.");
  await p.reload();
  await p.getByTestId("training-row").getByText("1 h 30 min").waitFor();
  const csv = await (await ctx.request.get(BASE + "/api/registers/training", { maxRedirects: 0 })).text();
  if (!csv.includes("AMLR changes for accountants") || !csv.includes("External: workshop")) throw new Error("✘ training CSV: " + csv.slice(0, 300));
  log("Training Register: external training recorded and in the Staff Training CSV");

  // Clients for bulk actions: one with an email (link not sent yet), one without
  for (const [first, last, email] of [["Rūta", "Bulkaitė", "ruta@example.lt"], ["Tomas", "Bulkus", ""]]) {
    await p.goto(BASE + "/app/clients/new");
    await p.getByLabel("First names (all) *").fill(first); await p.getByLabel("Surname *").fill(last);
    if (email) await p.getByLabel("Email", { exact: true }).fill(email);
    await p.getByLabel(/Send the client their secure link now/).uncheck();
    await p.getByRole("button", { name: "Create client" }).click();
    await p.getByRole("heading", { name: `${first} ${last}` }).waitFor();
  }
  const fileUrl = p.url();
  await p.goto(BASE + "/app/clients");
  await p.getByRole("checkbox", { name: "Select all clients shown" }).check();
  await p.getByRole("button", { name: "Send secure links" }).click();
  await p.getByTestId("bulk-result").getByText("Secure links sent: 1. Skipped: 1").waitFor();
  log("bulk: secure link sent to the client with an email, the other skipped");
  await p.getByRole("checkbox", { name: "Select Tomas Bulkus" }).check();
  await p.locator("select[name=bulkScopeReason]").selectOption("service-not-listed");
  await p.getByRole("button", { name: "Mark identification only" }).click();
  await p.getByTestId("bulk-result").getByText("1 client(s) marked identification only.").waitFor();
  await p.getByTestId("client-row").filter({ hasText: "Tomas Bulkus" }).getByText("Identification only").waitFor();
  log("bulk: client marked identification only with a reason");

  // Risk report PDF
  await p.goto(fileUrl + "?tab=risk");
  const [dl] = await Promise.all([p.waitForEvent("download"), p.getByTestId("risk-history").getByRole("link", { name: /Download PDF/ }).first().click()]);
  const head = require("fs").readFileSync(await dl.path()).subarray(0, 5).toString();
  if (head !== "%PDF-") throw new Error("✘ risk report is not a PDF: " + head);
  log("risk report downloads as PDF");

  // Review pack
  await p.goto(BASE + "/app/firm/review-pack");
  await p.getByTestId("review-pack").getByText("4. Who needs which check").waitFor();
  const [rp] = await Promise.all([p.waitForEvent("download"), p.getByRole("link", { name: "Download PDF" }).click()]);
  if (require("fs").readFileSync(await rp.path()).subarray(0, 5).toString() !== "%PDF-") throw new Error("✘ review pack is not a PDF");
  log("Review Pack: rules shown in plain words and downloadable as PDF");

  // Section tabs
  await p.goto(BASE + "/app/team");
  await p.getByRole("navigation", { name: "Team sections" }).getByRole("link", { name: "Training Register" }).waitFor();
  console.log("page errors:", errors);
  await b.close();
  if (errors.length) process.exit(1);
})().catch((e) => { console.error("✘", e.message); process.exit(1); });
