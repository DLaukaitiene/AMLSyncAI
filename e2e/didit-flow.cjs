/* eslint-disable @typescript-eslint/no-require-imports */
// Didit sandbox flow (needs DIDIT_API_KEY=sk_test_… and DIDIT_WORKFLOW_ID; live sandbox API, not run in CI).
//   CODE=… node e2e/didit-flow.cjs
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const { BASE, log, signupFirm, submit } = require("./helpers.cjs");
const sql = (q) => execSync(`psql -At "${process.env.DATABASE_URL}" -c '${q}'`).toString().trim();

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const { p } = await signupFirm(b, { code: process.env.CODE, company: "Didit Test UAB", email: "owner@didit-test.lt", sector: "ESTATE_AGENT" });
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(BASE + "/app/billing");
  await p.getByText("€15.00").first().waitFor();
  log("trial credit €15.00 shown");

  await p.goto(BASE + "/app/clients/new");
  await p.getByLabel("First names (all) *").fill("Camila");
  await p.getByLabel("Surname *").fill("Diaz");
  await p.getByLabel("Email").fill("camila@example.lt");
  await p.getByRole("button", { name: "Create client" }).click();
  await p.getByRole("heading", { name: "Camila Diaz" }).waitFor();
  const fileUrl = p.url();
  await submit(p, "Send identity check (€2.00)", "Identity check sent to camila@example.lt");
  log("identity check session created in Didit sandbox, link emailed");
  const sid = sql(`SELECT "diditSessionId" FROM "DiditSession" ORDER BY "createdAt" DESC LIMIT 1`);
  const sim = execSync(`curl -s -o /dev/null -w "%{http_code}" -X POST https://verification.didit.me/v3/session/${sid}/simulate/ -H "x-api-key: sk_test_proxy-injected-placeholder" -H "content-type: application/json" -d '{"new_status":"Approved","send_webhooks":false}'`).toString();
  log(`sandbox simulate Approved → HTTP ${sim}`);
  await p.goto(fileUrl);
  await submit(p, "Refresh result", "");
  await p.getByText(/Approved · sandbox · imported/).waitFor();
  const tasks = sql(`SELECT count(*) FROM "Task" WHERE kind = $$idv-review$$`);
  if (tasks !== "1") throw new Error("✘ expected idv-review task for approved-without-data, got " + tasks);
  log("approved session without ID data → review task, no verification recorded");

  await p.goto(fileUrl);
  await p.getByText(/screening with Didit/).click();
  await submit(p, "Screen (€3.00)", "");
  await p.waitForTimeout(1500);
  const scr = sql(`SELECT count(*) FROM "ScreeningResult" WHERE "listName" LIKE $$Didit%$$`);
  log(`Didit AML screening stored ${scr} result(s)`);
  await p.goto(BASE + "/app/billing");
  const bal = await p.getByTestId("balance").innerText().catch(() => p.locator("main").innerText());
  log("billing after two checks: " + bal.split("\n").find((l) => /€/.test(l)));
  if (errors.length) console.log("✘ page errors", errors);
  await b.close();
})().catch((e) => { console.log("✘", e.message); process.exit(1); });
