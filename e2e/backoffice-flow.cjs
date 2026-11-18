/* eslint-disable @typescript-eslint/no-require-imports */
// Backoffice (docs/BACKOFFICE_SPEC.md). Server must run with PLATFORM_ADMIN_EMAILS=triage@amlsyncai-team.lt,
// the TEST sanctions list loaded, and DATABASE_URL set (to skip the 15-minute self-approval cooling-off).
//   CODE1=… CODE2=… node e2e/backoffice-flow.cjs
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const { BASE, log, signupFirm, submit } = require("./helpers.cjs");

const sql = (q) => execSync(`psql -q -t -A -v ON_ERROR_STOP=1 "${process.env.DATABASE_URL}"`, { input: q, stdio: ["pipe", "pipe", "ignore"] }).toString().trim();
const backdateApprovals = () => sql(`UPDATE "AdminApproval" SET "createdAt" = now() - interval '20 minutes' WHERE status = 'pending'`);

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const { p: f } = await signupFirm(b, { code: process.env.CODE1, company: "Klientų Firma UAB", email: "owner@klientai.lt", sector: "ACCOUNTANT" });
  const { p: t } = await signupFirm(b, { code: process.env.CODE2, company: "AMLSyncAI Team", email: "triage@amlsyncai-team.lt", sector: "OTHER" });
  for (const x of [f, t]) x.on("pageerror", (e) => errors.push(e.message));

  // Customer data the Backoffice must never show.
  await f.goto(BASE + "/app/clients/new");
  await f.getByLabel("First names (all) *").fill("Jonas"); await f.getByLabel("Surname *").fill("Slaptas");
  await f.getByRole("button", { name: "Create client" }).click();
  await f.getByRole("heading", { name: "Jonas Slaptas" }).waitFor();
  const clientUrl = f.url();
  await f.getByText("Report a suspicion to the Compliance Officer").click();
  await f.getByLabel("What happened? *").fill("Secret case text XYZ"); await f.getByLabel("Why does it seem suspicious? *").fill("Secret case reasons XYZ");
  await submit(f, "Send report", "Sent to the Compliance Officer");

  const r = await f.goto(BASE + "/admin");
  if (r.status() !== 404) throw new Error("non-admin can open the Backoffice: " + r.status());
  log("non-admins get 404 on /admin");

  await t.goto(BASE + "/admin");
  await t.getByRole("heading", { name: "Today" }).waitFor();
  await t.getByTestId("funnel").waitFor();
  log("Today dashboard renders");

  await t.goto(BASE + "/admin/firms");
  await t.getByTestId("firm-list").getByRole("link", { name: "Klientų Firma UAB" }).click();
  await t.getByRole("heading", { name: "Klientų Firma UAB" }).waitFor();
  const firmUrl = t.url().split("?")[0];
  for (const tab of ["overview", "kyb", "users", "usage", "compliance", "billing", "support", "features", "timeline", "admin"]) {
    await t.goto(`${firmUrl}?tab=${tab}`);
    const text = await t.locator("body").innerText();
    if (/Slaptas|Secret case/.test(text)) throw new Error(`client or case data visible on Firm 360 tab ${tab}`);
  }
  for (const page of ["/admin", "/admin/users", "/admin/security", "/admin/abuse", "/admin/vendors", "/admin/content", "/admin/revenue", "/admin/privacy", "/admin/audit"]) {
    await t.goto(BASE + page);
    if (/Slaptas|Secret case/.test(await t.locator("body").innerText())) throw new Error("client or case data visible on " + page);
  }
  log("no client names or case content on any Backoffice page (STR wall)");

  // Firm KYB: a director on the TEST sanctions list → possible match → confirmed → suspended.
  await t.goto(`${firmUrl}?tab=kyb`);
  await t.getByLabel("Directors").fill("Ivan Sidorov");
  await t.getByLabel("Beneficial owners").fill("Rūta Jonaitienė");
  await submit(t, "Run KYB screening", "Possible match");
  await t.locator("select[name=decision]").selectOption("blocked");
  await t.getByLabel("Reasoning *").fill("Same name and the registry shows Russian citizenship; confirmed");
  await t.getByRole("button", { name: "Record decision" }).click();
  await t.getByTestId("kyb-result").first().getByText("blocked", { exact: true }).waitFor();
  await t.goto(`${firmUrl}?tab=overview`);
  await t.getByText(/Sanctions \/ KYB: Same name/).waitFor();
  log("firm KYB: sanctions match on a director confirmed, firm suspended");

  await f.goto(clientUrl);
  await f.getByRole("button", { name: /Screen again now/ }).click();
  await f.getByText(/suspended for your firm/).first().waitFor();
  log("suspended firm cannot start screenings, keeps read access");

  await t.goto(`${firmUrl}?tab=overview`);
  await t.locator("select[name=status]").selectOption("active");
  await t.getByLabel("Reason *").first().fill("KYB reviewed with legal: test data");
  await submit(t, "Set status", "Status set to active.");
  await t.getByLabel("Note").fill("Called the owner about onboarding.");
  await submit(t, "Add note", "Note added.");
  log("status reset and internal note added");

  // Credits: ≤ €100 directly, above that four-eyes (single owner: cooling-off).
  await t.goto(`${firmUrl}?tab=billing`);
  await t.getByLabel("Credit (EUR, excl. VAT) *").fill("50");
  await t.getByLabel("Reason / reference *").fill("Goodwill for onboarding delay");
  await submit(t, "Grant credit", "Credit of €50.00 added");
  await t.getByLabel("Credit (EUR, excl. VAT) *").fill("500");
  await t.getByLabel("Reason / reference *").fill("Prepayment PAY-1");
  await submit(t, "Grant credit", "an Owner must approve");
  await t.goto(BASE + "/admin/approvals");
  await t.getByTestId("pending-approvals").getByRole("button", { name: "Approve and run" }).click();
  await t.getByText(/cooling-off period/).first().waitFor();
  backdateApprovals();
  await t.reload();
  await t.getByTestId("pending-approvals").getByRole("button", { name: "Approve and run" }).click();
  await t.getByText("Credit of €500.00 added for Klientų Firma UAB.").waitFor();
  if (!sql(`SELECT "approverEmail" FROM "AdminAuditEvent" WHERE action = 'credit.grant' AND "approverEmail" IS NOT NULL`).includes("self-approved")) throw new Error("self-approval not labelled in the admin log");
  log("credit above €100 needs approval; single owner can self-approve only after cooling-off");

  // Admin roles: give the customer's owner the Support role (four-eyes), check least privilege.
  await t.goto(BASE + "/admin/team");
  await t.getByLabel("Email *").fill("owner@klientai.lt");
  await t.getByLabel("Support agent").check();
  await t.getByLabel("Reason *").fill("Test support role");
  await submit(t, "Request change", "Requested.");
  backdateApprovals();
  await t.goto(BASE + "/admin/approvals");
  await t.getByTestId("pending-approvals").getByRole("button", { name: "Approve and run" }).click();
  await t.getByText("owner@klientai.lt: SUPPORT.").waitFor();
  const ok = await f.goto(BASE + "/admin/support");
  const no = await f.goto(BASE + "/admin/revenue");
  if (ok.status() !== 200 || no.status() !== 404) throw new Error(`support role: /admin/support ${ok.status()}, /admin/revenue ${no.status()}`);
  log("Support agent role: support pages yes, revenue no");

  // Incident with personal data → breach clocks.
  await t.goto(BASE + "/admin/security");
  await t.getByText("Record an incident").click();
  await t.getByLabel("Title *").fill("Misdirected invoice email");
  await t.getByLabel("Affected firms (email domains)").fill("klientai.lt");
  await t.getByLabel("Personal data affected").check();
  await t.getByLabel("Includes data AMLSync controls").check();
  await t.getByRole("button", { name: "Record incident" }).click();
  await t.getByTestId("clocks").getByText(/Notify affected firms by/).waitFor();
  await t.getByTestId("clocks").getByText(/Notify the DPA/).waitFor();
  await t.locator("select[name=status]").selectOption("closed");
  await t.getByLabel("What happened / what was done").fill("Closing");
  await submit(t, "Save update", "Record that the affected firms were notified");
  log("incident register: breach clocks; cannot close before notifications are recorded");

  // Data subject request (controller).
  await t.goto(BASE + "/admin/privacy");
  await t.getByText("Record a request").click();
  await t.getByLabel("Requester name *").fill("Test Person");
  await t.getByLabel("Requester email *").fill("person@example.eu");
  await submit(t, "Record request", "Recorded.");
  await t.reload();
  await t.getByTestId("dsr").getByText("Test Person").waitFor();
  log("data subject request recorded with a one-month deadline");

  // Lock a user: their sessions end.
  await t.goto(BASE + "/admin/users?q=owner%40klientai.lt");
  await t.getByTestId("user-list").getByRole("link", { name: /Owner of Klientų/ }).click();
  await t.getByLabel("Reason (lock account) *").fill("Suspected account takeover (test)");
  await submit(t, "Lock account", "Locked and signed out everywhere.");
  await f.goto(BASE + "/app");
  if (!/\/login/.test(f.url())) throw new Error("locked user still signed in: " + f.url());
  log("locked user is signed out everywhere");

  await t.goto(BASE + "/admin/audit");
  await t.getByTestId("chain").getByText(/chain intact/).waitFor();
  const n = Number(sql(`SELECT count(*) FROM "AdminAuditEvent"`));
  if (n < 8) throw new Error("too few admin audit entries: " + n);
  let blocked = false;
  try { sql(`UPDATE "AdminAuditEvent" SET reason = 'x'`); } catch { blocked = true; }
  if (!blocked) throw new Error("admin audit log is editable");
  log(`admin log: ${n} entries, hash chain intact, UPDATE refused by the database`);

  console.log("page errors:", errors);
  if (errors.length) throw new Error("page errors");
  await b.close();
})().catch((e) => { console.error("✘", e.message); process.exit(1); });
