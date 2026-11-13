/* eslint-disable @typescript-eslint/no-require-imports */
// Just-in-time support access (spec §8C.7, §11.14). Server must run with PLATFORM_ADMIN_EMAILS=triage@amlsyncai-team.lt
//   CODE1=… CODE2=… node e2e/support-flow.cjs
const { chromium } = require("playwright");
const { BASE, log, signupFirm, submit } = require("./helpers.cjs");

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const { p: f } = await signupFirm(b, { code: process.env.CODE1, company: "Klientų Firma UAB", email: "owner@klientai.lt", sector: "ACCOUNTANT" });
  const { p: t } = await signupFirm(b, { code: process.env.CODE2, company: "AMLSyncAI Team", email: "triage@amlsyncai-team.lt", sector: "OTHER" });
  for (const x of [f, t]) x.on("pageerror", (e) => errors.push(e.message));
  await f.goto(BASE + "/app/clients/new");
  await f.getByLabel("First names (all) *").fill("Visible"); await f.getByLabel("Surname *").fill("Summary");
  await f.getByRole("button", { name: "Create client" }).click();
  await f.getByRole("heading", { name: "Visible Summary" }).waitFor();
  await f.getByText("Report a suspicion to the Compliance Officer").click();
  await f.getByLabel("What happened? *").fill("Secret case text XYZ"); await f.getByLabel("Why does it seem suspicious? *").fill("Secret case reasons XYZ");
  await submit(f, "Send report", "Sent to the Compliance Officer");

  await t.goto(BASE + "/admin/support");
  await t.getByLabel("Firm email domain *").fill("klientai.lt");
  await t.getByLabel("Reason (shown to the firm) *").fill("Customer reported dashboard counts look wrong");
  await t.getByLabel(/Hours/).fill("2");
  await submit(t, "Request access", "Requested.");
  await t.reload();
  if (await t.getByRole("link", { name: /Open \(until/ }).count()) throw new Error("access before approval");
  log("access requested; nothing visible before approval");

  await f.goto(BASE + "/app/security");
  const row = f.getByTestId("support-grant").first();
  await row.getByText("Customer reported dashboard counts look wrong").waitFor();
  await row.getByRole("button", { name: "Approve" }).click();
  await f.getByText(/active until/).first().waitFor();
  log("firm approved 2 hours");

  await t.goto(BASE + "/admin/support");
  await t.getByRole("link", { name: /Open \(until/ }).click();
  await t.getByText("Visible Summary").waitFor();
  const view = await t.locator("main").innerText();
  if (/Secret case/.test(view)) throw new Error("case content visible to support");
  const url = t.url();
  log("support sees the read-only summary (no case content)");

  await f.reload();
  await f.locator("tbody").getByText("staff-access", { exact: true }).first().waitFor();
  log("the view appears in the firm's security log");
  await f.getByTestId("support-grant").first().getByRole("button", { name: "Revoke now" }).click();
  await f.getByText("revoked").first().waitFor();
  const r = await t.goto(url);
  if (r.status() !== 404) throw new Error("still accessible after revoke: " + r.status());
  log("revoked: support view returns 404");

  console.log("page errors:", errors);
  await b.close();
})().catch((e) => { console.error("✘", e.message); process.exit(1); });
