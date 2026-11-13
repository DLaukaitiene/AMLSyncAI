/* eslint-disable @typescript-eslint/no-require-imports */
// Privacy notice, explanation of decision, security.txt, sessions, offices, two-factor recovery (spec §3A, §8C.3, Art. 76).
//   CODE1=… CODE2=… DATABASE_URL=… node e2e/extras-flow.cjs
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const fs = require("fs");
const { BASE, log, signupFirm, submit, lastMail, totp } = require("./helpers.cjs");
const sql = (q) => execSync(`psql "${process.env.DATABASE_URL}" -tAc ${JSON.stringify(q)}`).toString().trim();

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const { p } = await signupFirm(b, { code: process.env.CODE1, company: "Baltic Gold UAB", email: "owner@balticgold.lt", sector: "ACCOUNTANT" });
  p.on("pageerror", (e) => errors.push(e.message));

  // security.txt and disclosure page
  const st = await (await b.newContext()).request.get(BASE + "/.well-known/security.txt");
  if (st.status() !== 200 || !(await st.text()).includes("Contact:")) throw new Error("security.txt");
  log("security.txt served");

  // Privacy notice → shown in the portal
  await p.goto(BASE + "/app/firm/privacy");
  await p.locator("section", { hasText: "Privacy notice for clients" }).getByRole("button", { name: "Generate new version" }).click();
  await p.getByText("Draft v1").first().waitFor();
  await p.getByRole("button", { name: "Approve" }).first().click();
  await p.getByText("In force v1").first().waitFor();
  log("privacy notice generated and approved");
  await p.goto(BASE + "/app/clients/new");
  await p.getByLabel("First names (all) *").fill("Eglė"); await p.getByLabel("Surname *").fill("Klientė"); await p.getByLabel("Email").fill("egle@example.lt");
  await p.getByRole("button", { name: "Create client" }).click();
  await p.getByRole("heading", { name: "Eglė Klientė" }).waitFor();
  const fileUrl = p.url();
  await submit(p, "Send link", "Secure link sent");
  const c = await (await b.newContext()).newPage();
  const link = await lastMail(c, "egle@example.lt");
  await c.goto(link); await submit(c, "Send me a code", "We've sent");
  await c.goto(BASE + "/dev/mailbox");
  const code = (await c.locator('article[data-to="egle@example.lt"] pre').first().innerText()).match(/\b\d{6}\b/)[0];
  await c.goto(link); await c.getByLabel("6-digit code *").fill(code); await c.getByRole("button", { name: "Continue" }).click();
  await c.getByText("How Baltic Gold UAB uses your data (privacy notice)").waitFor();
  log("client sees the firm's privacy notice in the portal");

  // Explanation of decision
  await p.goto(fileUrl);
  const [dl] = await Promise.all([p.waitForEvent("download"), p.getByRole("link", { name: /Explanation of the decision/ }).click()]);
  if (fs.readFileSync(await dl.path()).subarray(0, 5).toString() !== "%PDF-") throw new Error("explanation pdf");
  log("explanation PDF for the client");
  await p.getByText("Report a suspicion to the Compliance Officer").click();
  await p.getByLabel("What happened? *").fill("Client asked us to backdate invoices");
  await p.getByLabel("Why does it seem suspicious? *").fill("Possible false accounting to hide funds");
  await submit(p, "Send report", "Sent to the Compliance Officer");
  const fileId = fileUrl.split("/").pop();
  const r409 = await p.request.get(BASE + "/api/explain/" + fileId);
  if (r409.status() !== 409) throw new Error("explain with case: " + r409.status());
  await p.reload();
  if (await p.getByRole("link", { name: /Explanation of the decision/ }).count()) throw new Error("link still shown");
  log("no explanation once an internal report exists (tipping-off)");

  // Sessions list
  await p.goto(BASE + "/app/team");
  await p.getByText("this session").waitFor();
  log("session list shows the current session");

  // Office in Poland with a lower cash cap
  await p.goto(BASE + "/app/settings/country-profile");
  await p.getByLabel("Office name *").fill("Warsaw branch"); await p.getByLabel("Member state *").fill("PL");
  await submit(p, "Add office", "Office added with a PL Country Profile");
  await p.getByRole("link", { name: "Warsaw branch (PL)" }).click();
  await p.getByRole("heading", { name: /Poland · Warsaw branch \(host state\)/ }).waitFor();
  await p.getByLabel("Cash cap (EUR)").fill("3000");
  await submit(p, "Save new version", "Saved as version 2");
  const cashTest = async (office) => {
    await p.goto(BASE + "/app/matters/new");
    await p.getByLabel("Title *").fill(`Engagement ${office}`);
    if (office !== "head") await p.locator("select[name=officeId]").selectOption({ label: "Warsaw branch (PL)" });
    await p.getByRole("button", { name: "Create matter" }).click();
    await p.getByRole("heading", { name: `Engagement ${office}` }).waitFor();
    await p.getByText("Add a party").click();
    const d = p.locator("details", { hasText: "Add a party" });
    await d.locator("select[name=existingPartyId]").selectOption({ label: "Eglė Klientė" });
    await d.getByRole("button", { name: "Add party" }).click();
    await p.getByText("Party added.").first().waitFor(); await p.reload();
    const f = p.locator("form", { hasText: "Paid by" });
    await f.getByLabel("Date").fill("2026-11-13"); await f.getByLabel("Amount (EUR)").fill("4000"); await f.locator("select[name=method]").selectOption("cash");
    await f.getByRole("button", { name: "Record" }).click();
    return p.locator("form [role=alert], form [role=status]").first().innerText();
  };
  const head = await cashTest("head");
  const pl = await cashTest("pl");
  if (/not allowed/.test(head) || !/€3,000 or more are not allowed/.test(pl)) throw new Error(`cash: head=${head} pl=${pl}`);
  log("€4,000 cash: allowed at head office (LT cap €10,000), blocked at the Warsaw branch (PL profile cap €3,000)");

  // Colleague resets two-factor
  await p.goto(BASE + "/app/team");
  await p.getByLabel("Name *").fill("Bob"); await p.getByLabel("Email *").fill("bob@balticgold.lt");
  await submit(p, "Send invitation", "Invitation sent");
  const q = await (await b.newContext()).newPage();
  await q.goto(await lastMail(q, "bob@balticgold.lt"));
  await q.getByLabel("Choose a password *").fill("another long passphrase 42"); await q.getByRole("button", { name: "Accept invitation" }).click();
  await q.getByRole("heading", { name: "Set up two-factor authentication" }).waitFor();
  await q.getByText("Can't scan?").click();
  const bs = (await q.locator("details code").innerText()).replace(/\s/g, "");
  await q.getByLabel("6-digit code").fill(totp(bs)); await q.getByRole("button", { name: /Turn on/ }).click();
  await q.getByTestId("recovery-codes").waitFor();
  await p.reload();
  await p.getByRole("listitem").filter({ hasText: "bob@balticgold.lt" }).getByRole("button", { name: "Reset two-factor" }).click();
  await p.getByText(/two-factor not set up yet/).waitFor();
  const q2 = await (await b.newContext()).newPage();
  await q2.goto(BASE + "/login");
  await q2.getByLabel("Email *").fill("bob@balticgold.lt"); await q2.getByLabel("Password *").fill("another long passphrase 42");
  await q2.getByRole("button", { name: "Continue" }).click();
  await q2.getByRole("heading", { name: "Set up two-factor authentication" }).waitFor();
  log("colleague's two-factor reset by the Owner; Bob must set it up again");

  // Single-user firm: 72-hour recovery
  const { p: s1 } = await signupFirm(b, { code: process.env.CODE2, company: "Solo Apskaita", email: "solo@solo.lt", sector: "ACCOUNTANT" });
  const anon = await (await b.newContext()).newPage();
  await anon.goto(BASE + "/recover");
  await anon.getByLabel("Email *").fill("solo@solo.lt"); await anon.getByLabel("Password *").fill("correct horse battery staple");
  await submit(anon, "Start recovery", "If the details are correct");
  const mail = await (async () => { await anon.goto(BASE + "/dev/mailbox"); return anon.locator('article[data-to="solo@solo.lt"]', { hasText: "two-factor recovery requested" }).first().innerText(); })();
  const confirm = mail.match(/http\S+\/recover\/confirm\/\S+/)[0];
  await anon.goto(confirm); await anon.getByRole("button", { name: "Confirm it was me" }).click();
  await anon.getByText(/Confirmed. Sign in after/).waitFor();
  const login = async () => {
    const x = await (await b.newContext()).newPage();
    await x.goto(BASE + "/login");
    await x.getByLabel("Email *").fill("solo@solo.lt"); await x.getByLabel("Password *").fill("correct horse battery staple");
    await x.getByRole("button", { name: "Continue" }).click();
    await x.waitForURL(/login\/mfa|mfa\/setup/);
    return x.url();
  };
  if (!/login\/mfa/.test(await login())) throw new Error("recovered before 72h");
  log("within 72 hours: still asks for the old second factor");
  sql(`UPDATE "EmailToken" SET data = jsonb_set(data, '{notBefore}', to_jsonb((now() - interval '1 minute')::text)) WHERE purpose = 'mfa-recovery'`);
  if (!/mfa\/setup/.test(await login())) throw new Error("not recovered after 72h");
  log("after 72 hours (backdated in the DB): password sign-in leads to two-factor setup");
  void s1;

  console.log("page errors:", errors);
  await b.close();
})().catch((e) => { console.error("✘", e.message); process.exit(1); });
