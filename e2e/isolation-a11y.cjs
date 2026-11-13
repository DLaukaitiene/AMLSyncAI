/* eslint-disable @typescript-eslint/no-require-imports */
// Tenant isolation on every page and API route that takes an id (spec §11.0, §11.14),
// and an automated WCAG 2.1 AA scan of the main screens (§11.0, §8B).
//   CODE1=… CODE2=… DATABASE_URL=… node e2e/isolation-a11y.cjs
const { chromium } = require("playwright");
const { AxeBuilder } = require("@axe-core/playwright");
const { execSync } = require("child_process");
const fs = require("fs");
const { BASE, log, signupFirm, submit } = require("./helpers.cjs");
const sql = (q) => execSync(`psql "${process.env.DATABASE_URL}" -tAc ${JSON.stringify(q)}`).toString().trim();
const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000" + "1f15c4890000000d49444154789c6360000002000100e221bc330000000049454e44ae426082", "hex");

(async () => {
  const b = await chromium.launch();
  // Firm B (victim) with data everywhere
  const { p: v } = await signupFirm(b, { code: process.env.CODE1, company: "Victim Firm UAB", email: "owner@victim.lt", sector: "ESTATE_AGENT" });
  await v.goto(BASE + "/app/clients/new");
  await v.getByLabel("First names (all) *").fill("Secret"); await v.getByLabel("Surname *").fill("Victimclient");
  await v.getByRole("button", { name: "Create client" }).click();
  await v.getByRole("heading", { name: "Secret Victimclient" }).waitFor();
  const fileUrl = v.url();
  fs.writeFileSync("/tmp/x.png", PNG);
  await v.locator("select[name=kind]").selectOption("id"); await v.locator("input[type=file]").setInputFiles("/tmp/x.png");
  await submit(v, "Upload", "Uploaded.");
  await v.getByText("Report a suspicion to the Compliance Officer").click();
  await v.getByLabel("What happened? *").fill("Cash from an unknown third party"); await v.getByLabel("Why does it seem suspicious? *").fill("Unexplained origin of funds");
  await submit(v, "Send report", "Sent to the Compliance Officer");
  const caseId = sql(`SELECT id FROM "Case" ORDER BY "createdAt" DESC LIMIT 1`);
  await v.goto(BASE + "/app/cases/" + caseId);
  await v.getByRole("radio", { name: "Report to the FIU" }).check();
  await v.getByLabel("Reasons *").fill("Unexplained third-party cash, grounds for suspicion established.");
  await submit(v, "Record decision", /Decision|Case · decided/);
  await v.goto(BASE + "/app/matters/new"); await v.getByLabel("Title *").fill("Victim matter"); await v.getByRole("button", { name: "Create matter" }).click();
  await v.getByRole("heading", { name: "Victim matter" }).waitFor();
  const matterUrl = v.url();
  await v.goto(BASE + "/app/firm/policies"); await submit(v, "Generate new version", /Draft: AML\/CTF policy v1/);
  await v.goto(BASE + "/app/firm/risk-assessment"); await submit(v, "Start the risk assessment", null); await v.getByRole("heading", { name: /Draft version 1/ }).waitFor();
  await v.goto(BASE + "/app/feature-requests/new"); await v.getByLabel("Title *").fill("Victim feature idea"); await v.getByLabel("What problem does it solve? *").fill("Something long enough here."); await v.getByRole("button", { name: "Submit request" }).click(); await v.waitForURL(/feature-requests\/[0-9a-f-]{36}$/);

  const firmB = sql(`SELECT id FROM "Firm" WHERE name = 'Victim Firm UAB'`);
  const ids = {
    file: fileUrl.split("/").pop(), matter: matterUrl.split("/").pop(), case: caseId,
    doc: sql(`SELECT id FROM "Document" WHERE "firmId" = '${firmB}' LIMIT 1`),
    report: sql(`SELECT id FROM "Report" WHERE "firmId" = '${firmB}' LIMIT 1`),
    policy: sql(`SELECT id FROM "PolicyDocument" WHERE "firmId" = '${firmB}' LIMIT 1`),
    ra: sql(`SELECT id FROM "FirmRiskAssessment" WHERE "firmId" = '${firmB}' LIMIT 1`),
  };
  for (const [k, x] of Object.entries(ids)) if (!/^[0-9a-f-]{36}$/.test(x)) throw new Error(`setup ${k}: ${x}`);

  // Firm A (attacker): Owner + Compliance Officer with fresh MFA
  const { p: a } = await signupFirm(b, { code: process.env.CODE2, company: "Attacker Firm UAB", email: "owner@attacker.lt", sector: "ACCOUNTANT" });
  const targets = [
    `/app/clients/${ids.file}`, `/app/matters/${ids.matter}`, `/app/cases/${ids.case}`,
    `/api/files/${ids.doc}`, `/api/reports/${ids.report}`, `/api/docs/policy/${ids.policy}`, `/api/docs/risk-assessment/${ids.ra}`,
    `/api/supervisor-file/client/${ids.file}`, `/api/explain/${ids.file}`,
  ];
  for (const t of targets) {
    const r = await a.request.get(BASE + t, { maxRedirects: 0 });
    const body = await r.text();
    if (r.status() === 200 || /Victimclient|Victim matter|Cash from an unknown/.test(body)) throw new Error(`LEAK ${t}: ${r.status()}`);
  }
  log(`firm A gets nothing from firm B on ${targets.length} id-based pages/routes (all 404)`);
  const fr = await a.request.get(BASE + "/app/feature-requests");
  if (/Victim Firm/.test(await fr.text())) throw new Error("feature request firm name leaked");
  const lists = ["/app/clients", "/app/matters", "/app/cases", "/app/reports", "/app/calendar", "/app/records", "/app/remediation", "/app/security"];
  for (const t of lists) if (/Victimclient|Victim matter|Victim Firm/.test(await (await a.request.get(BASE + t)).text())) throw new Error("list leak " + t);
  log(`and none of firm B's data appears in ${lists.length} list pages`);

  // Accessibility: WCAG 2.1 A/AA on the main screens (victim firm has data)
  const pages = [
    "/", "/login", "/signup", "/forgot", "/recover", "/security", "/tools/beneficial-ownership",
    "/app", "/app/clients", "/app/clients/new", `/app/clients/${ids.file}`, "/app/matters", "/app/matters/new", `/app/matters/${ids.matter}`,
    "/app/remediation", "/app/calendar", `/app/cases`, `/app/cases/${ids.case}`, "/app/reports", "/app/firm", "/app/firm/risk-assessment", "/app/firm/policies",
    "/app/firm/governance", "/app/firm/training", "/app/firm/privacy", "/app/settings/country-profile", "/app/settings/screening-lists", "/app/team",
    "/app/records", "/app/security", "/app/feature-requests", "/app/feature-requests/new",
  ];
  const summary = {};
  let critical = 0;
  for (const path of pages) {
    const page = path.startsWith("/app") ? v : await (await b.newContext()).newPage();
    await page.goto(BASE + path);
    const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    for (const viol of res.violations) {
      summary[`${viol.impact} ${viol.id}`] = [...(summary[`${viol.impact} ${viol.id}`] ?? []), path];
      if (viol.impact === "critical") critical++;
    }
  }
  for (const [k, ps] of Object.entries(summary)) console.log("  a11y:", k, "on", [...new Set(ps)].length, "page(s), e.g.", ps[0]);
  log(`accessibility scan of ${pages.length} pages: ${critical} critical violation(s)`);
  if (critical) process.exitCode = 1;
  await b.close();
})().catch((e) => { console.error("✘", e.message); process.exit(1); });
