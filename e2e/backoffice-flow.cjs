/* eslint-disable @typescript-eslint/no-require-imports */
// Backoffice (docs/BACKOFFICE_SPEC.md). Server must run with BACKOFFICE_OWNER_EMAIL=triage@amlsyncai-team.lt BACKOFFICE_TEAM=on,
// the TEST sanctions list loaded, and DATABASE_URL set (to skip the 15-minute self-approval cooling-off).
//   CODE1=… CODE2=… node e2e/backoffice-flow.cjs
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const { BASE, log, signupFirm, submit, totp } = require("./helpers.cjs");

const sql = (q) => execSync(`psql -q -t -A -v ON_ERROR_STOP=1 "${process.env.DATABASE_URL}"`, { input: q, stdio: ["pipe", "pipe", "ignore"] }).toString().trim();
const backdateApprovals = () => sql(`UPDATE "AdminApproval" SET "createdAt" = now() - interval '20 minutes' WHERE status = 'pending'`);

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const { p: f } = await signupFirm(b, { code: process.env.CODE1, company: "Klientų Firma UAB", email: "owner@klientai.lt", sector: "ACCOUNTANT" });
  const { p: t, secret: adminSecret } = await signupFirm(b, { code: process.env.CODE2, company: "AMLSyncAI Team", email: "triage@amlsyncai-team.lt", sector: "OTHER" });
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

  const r = await f.goto(BASE + "/adminpage1&");
  if (r.status() !== 404) throw new Error("non-admin can open the Backoffice: " + r.status());
  log("non-admins get 404 on /admin");

  await t.goto(BASE + "/adminpage1&");
  await t.getByRole("heading", { name: "Today" }).waitFor();
  await t.getByTestId("funnel").waitFor();
  log("Today dashboard renders");

  await t.goto(BASE + "/adminpage1&/firms");
  await t.getByTestId("firm-list").getByRole("link", { name: "Klientų Firma UAB" }).click();
  await t.getByRole("heading", { name: "Klientų Firma UAB" }).waitFor();
  const firmUrl = t.url().split("?")[0];
  for (const tab of ["overview", "kyb", "users", "usage", "compliance", "billing", "support", "features", "timeline", "admin"]) {
    await t.goto(`${firmUrl}?tab=${tab}`);
    const text = await t.locator("body").innerText();
    if (/Slaptas|Secret case/.test(text)) throw new Error(`client or case data visible on Firm 360 tab ${tab}`);
  }
  for (const page of ["/adminpage1&/website", "/adminpage1&/leads", "/adminpage1&/tickets", "/adminpage1&/comms", "/adminpage1&/expert", "/adminpage1&", "/adminpage1&/users", "/adminpage1&/security", "/adminpage1&/abuse", "/adminpage1&/vendors", "/adminpage1&/content", "/adminpage1&/revenue", "/adminpage1&/privacy", "/adminpage1&/audit"]) {
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
  await t.goto(BASE + "/adminpage1&/approvals");
  await t.getByTestId("pending-approvals").getByRole("button", { name: "Approve and run" }).click();
  await t.getByText(/cooling-off period/).first().waitFor();
  backdateApprovals();
  await t.reload();
  await t.getByTestId("pending-approvals").getByRole("button", { name: "Approve and run" }).click();
  await t.getByText("Credit of €500.00 added for Klientų Firma UAB.").waitFor();
  if (!sql(`SELECT "approverEmail" FROM "AdminAuditEvent" WHERE action = 'credit.grant' AND "approverEmail" IS NOT NULL`).includes("self-approved")) throw new Error("self-approval not labelled in the admin log");
  log("credit above €100 needs approval; single owner can self-approve only after cooling-off");

  // Admin roles: give the customer's owner the Support role (four-eyes), check least privilege.
  await t.goto(BASE + "/adminpage1&/team");
  await t.getByLabel("Email *").fill("owner@klientai.lt");
  await t.getByLabel("Support agent").check();
  await t.getByLabel("Reason *").fill("Test support role");
  await submit(t, "Request change", "Requested.");
  backdateApprovals();
  await t.goto(BASE + "/adminpage1&/approvals");
  await t.getByTestId("pending-approvals").getByRole("button", { name: "Approve and run" }).click();
  await t.getByText("owner@klientai.lt: SUPPORT.").waitFor();
  const ok = await f.goto(BASE + "/adminpage1&/support");
  const no = await f.goto(BASE + "/adminpage1&/revenue");
  if (ok.status() !== 200 || no.status() !== 404) throw new Error(`support role: /admin/support ${ok.status()}, /admin/revenue ${no.status()}`);
  log("Support agent role: support pages yes, revenue no");

  // Backup: Owner downloads an encrypted backup; a support agent can't.
  await t.goto(BASE + "/adminpage1&/security");
  const [bk] = await Promise.all([t.waitForEvent("download"), t.getByTestId("download-backup").click()]);
  const head = require("fs").readFileSync(await bk.path()).subarray(0, 8).toString();
  if (head !== "AMLSBK01") throw new Error("✘ backup file header: " + head);
  if ((await f.request.get(BASE + "/api/admin/backup", { maxRedirects: 0 })).status() !== 404) throw new Error("✘ support agent could download a backup");
  log("encrypted backup downloads for the Owner only");

  // Incident with personal data → breach clocks.
  await t.goto(BASE + "/adminpage1&/security");
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
  await t.goto(BASE + "/adminpage1&/privacy");
  await t.getByText("Record a request").click();
  await t.getByLabel("Requester name *").fill("Test Person");
  await t.getByLabel("Requester email *").fill("person@example.eu");
  await submit(t, "Record request", "Recorded.");
  await t.reload();
  await t.getByTestId("dsr").getByText("Test Person").waitFor();
  log("data subject request recorded with a one-month deadline");

  // Support ticket: customer → Backoffice → customer rating.
  await f.goto(BASE + "/app/support");
  await f.getByLabel("Subject *").fill("Invoice PDF does not open");
  await f.locator("select[name=category]").selectOption("billing");
  await f.getByLabel("What happened?").fill("The November invoice download shows an error page.");
  await f.getByLabel("I confirm the text contains no client data").check();
  await f.getByRole("button", { name: "Send to AMLSync" }).click();
  await f.getByTestId("thread").getByText("The November invoice download").waitFor();
  const ticketUrl = f.url();
  await t.goto(BASE + "/adminpage1&/tickets");
  await t.getByTestId("ticket-list").getByRole("link", { name: "Invoice PDF does not open" }).click();
  await t.getByLabel("Reply to the customer").fill("Fixed on our side, please try again.");
  await submit(t, "Send", "Reply sent");
  await f.goto(ticketUrl);
  await f.getByText("Fixed on our side").waitFor();
  await f.getByRole("button", { name: "Rate and close" }).click();
  await f.getByText("You rated this 5/5").waitFor();
  log("support ticket: opened in the app, answered in the Backoffice, rated by the customer");

  // Website: page view beacon and contact form → lead (as sent from amlsync.com).
  const api = await b.newContext();
  const web = { headers: { origin: "https://amlsync.com", "content-type": "text/plain", "user-agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36" } };
  const pv = await api.request.post(BASE + "/api/t", { ...web, data: JSON.stringify({ path: "/app.html?email=x@y.lt", ref: "https://chatgpt.com/", lang: "lt-LT" }) });
  const ld = await api.request.post(BASE + "/api/leads", { ...web, data: JSON.stringify({ name: "Rasa Apskaitininkė", company: "Skaičiai UAB", email: "rasa@skaiciai.lt", need: "AMLSync App (software)", message: "We are 6 accountants and need AMLR onboarding." }) });
  const bad = await api.request.post(BASE + "/api/leads", { headers: { origin: "https://evil.example", "content-type": "text/plain" }, data: JSON.stringify({ name: "x", email: "x@y.lt" }) });
  if (pv.status() !== 204 || ld.status() !== 204 || bad.status() !== 403) throw new Error(`api statuses ${pv.status()} ${ld.status()} ${bad.status()}`);
  if (pv.headers()["access-control-allow-origin"] !== "https://amlsync.com") throw new Error("CORS header missing");
  if (sql(`SELECT count(*) FROM "WebEvent" WHERE path = '/app.html' AND referrer = 'chatgpt.com'`) !== "1") throw new Error("page view not stored without query string");
  await t.goto(BASE + "/adminpage1&/website");
  await t.getByText("AI: ChatGPT").waitFor();
  await t.goto(BASE + "/adminpage1&/leads");
  await t.getByTestId("lead-list").getByRole("link", { name: "Rasa Apskaitininkė" }).click();
  await t.getByText("We are 6 accountants").waitFor();
  await t.locator("select[name=stage]").selectOption("contacted");
  await t.getByLabel("Next step", { exact: true }).fill("Demo call");
  await submit(t, "Save", "Saved.");
  log("website: cookieless page view (AI referral) and contact form lead; foreign origins refused");

  // In-app message to Lithuanian firms.
  await t.goto(BASE + "/adminpage1&/comms");
  await t.getByLabel("Title *").fill("AMLA CDD standard adopted");
  await t.getByLabel("Message").fill("What changes for you: see the release notes.");
  await t.getByLabel("Country (empty = all)").fill("LT");
  await submit(t, "Publish", "Banner live for");
  await f.goto(BASE + "/app");
  await f.getByTestId("announcements").getByText("AMLA CDD standard adopted").waitFor();
  await f.getByTestId("announcements").getByRole("button", { name: "Dismiss" }).click();
  await f.waitForFunction(() => !document.querySelector('[data-testid="announcements"]'));
  log("in-app message shown to the segment and dismissible");

  // Public status page.
  await t.goto(BASE + "/adminpage1&/security");
  await t.getByTestId("incidents").getByRole("link", { name: "Misdirected invoice email" }).click();
  await t.getByLabel("Show on the public status page").check();
  await t.getByLabel("Public summary (no personal data)").fill("Some invoice emails were delayed.");
  await t.getByLabel("What happened / what was done").fill("Publishing");
  await submit(t, "Save update", "Incident updated.");
  const anon = await (await b.newContext()).newPage();
  await anon.goto(BASE + "/status");
  await anon.getByTestId("status-summary").getByText("1 ongoing incident(s)").waitFor();
  await anon.getByText("Some invoice emails were delayed.").waitFor();
  log("public status page shows published incidents only");

  // Anonymous visit → sign-in → two-factor → back in the Backoffice.
  await anon.goto(BASE + "/adminpage1&/firms");
  if (!/\/login\?next=/.test(anon.url())) throw new Error("anonymous not sent to sign-in: " + anon.url());
  await anon.getByLabel("Email").fill("triage@amlsyncai-team.lt");
  await anon.getByLabel("Password").fill("correct horse battery staple");
  await anon.getByRole("button", { name: "Continue" }).click();
  await anon.getByLabel("6-digit code from your authenticator app").fill(totp(adminSecret));
  await anon.getByRole("button", { name: "Sign in" }).click();
  await anon.getByRole("heading", { name: "Firms" }).waitFor();
  log("sign-in from the Backoffice link returns to the Backoffice after two-factor");

  // Just-in-time elevation: authenticator code again after an hour.
  sql(`UPDATE "Session" SET "mfaAt" = now() - interval '2 hours' WHERE id = (SELECT s.id FROM "Session" s JOIN "User" u ON u.id = s."userId" WHERE u.email = 'triage@amlsyncai-team.lt' ORDER BY s."createdAt" DESC LIMIT 1)`);
  await anon.goto(BASE + "/adminpage1&");
  if (!/\/reauth\?next=%2Fadminpage1%26/.test(anon.url())) throw new Error("no re-authentication after an hour: " + anon.url());
  log("Backoffice asks for the authenticator code again after an hour");

  // Lock a user: their sessions end.
  await t.goto(BASE + "/adminpage1&/users?q=owner%40klientai.lt");
  await t.getByTestId("user-list").getByRole("link", { name: /Owner of Klientų/ }).click();
  await t.getByLabel("Reason (lock account) *").fill("Suspected account takeover (test)");
  await submit(t, "Lock account", "Locked and signed out everywhere.");
  await f.goto(BASE + "/app");
  if (!/\/login/.test(f.url())) throw new Error("locked user still signed in: " + f.url());
  log("locked user is signed out everywhere");

  await t.goto(BASE + "/adminpage1&/audit");
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
