/* eslint-disable @typescript-eslint/no-require-imports */
// Firm risk assessment and Policy Builder end-to-end (spec §4.1, §4.8, §11.2, §11.3).   CODE=… node e2e/firm-flow.cjs
const { chromium } = require("playwright");
const fs = require("fs");
const { BASE, log, signupFirm, submit } = require("./helpers.cjs");

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const { p } = await signupFirm(b, { code: process.env.CODE, company: "Apskaita ir mokesčiai UAB", email: "owner@apskaita.lt", sector: "ACCOUNTANT" });
  p.on("pageerror", (e) => errors.push(e.message));

  // Firm profile: adding a sector triggers a risk-assessment review
  await p.goto(BASE + "/app/firm");
  await p.getByLabel("Trader in high-value goods").check();
  await submit(p, "Save firm profile", "review the risk assessment before you start");
  await p.goto(BASE + "/app/calendar");
  await p.getByText("Review the business-wide risk assessment").waitFor();
  log("new sector → risk-assessment review task");

  // Risk assessment
  await p.goto(BASE + "/app/firm/risk-assessment");
  await submit(p, "Start the risk assessment", null);
  await p.getByRole("heading", { name: /Draft version 1/ }).waitFor();
  for (const name of await p.locator("input[type=radio]").evaluateAll((els) => [...new Set(els.map((e) => e.name))])) {
    const opts = p.locator(`input[type=radio][name="${name}"]`);
    // risk questions: second option; controls: last option (fully in place)
    if (name.startsWith("k-")) await opts.last().check(); else await opts.nth(1).check();
  }
  await p.locator('input[name="g-ru-by"]').nth(3).check(); // one very high factor
  await submit(p, "Save and calculate", "Ready for management approval");
  await p.getByRole("heading", { name: "Result (draft)" }).waitFor();
  const result = await p.locator("article").first().innerText();
  if (!/Sanctions evasion/.test(result) || !/Action plan/.test(result)) throw new Error("result: " + result.slice(0, 400));
  log("result:", result.match(/Overall residual risk\s*\S+/)?.[0]);
  const [dl] = await Promise.all([p.waitForEvent("download"), p.getByRole("link", { name: "Download PDF" }).first().click()]);
  const pdf = fs.readFileSync(await dl.path());
  if (pdf.subarray(0, 5).toString() !== "%PDF-" || pdf.length < 5000) throw new Error("bad PDF");
  log("PDF downloaded:", pdf.length, "bytes");
  await submit(p, "Approve (management)", /In force: version 1/);
  log("approved by management; in force");

  // Policies
  await p.goto(BASE + "/app/firm/policies");
  await submit(p, "Generate new version", /Draft: AML\/CTF policy v1/);
  const draft = await p.locator("section", { hasText: "Draft: AML/CTF policy v1" }).innerText();
  for (const h of ["Risk assessment", "Customer due diligence", "Targeted financial sanctions", "Reporting of suspicions", "Outsourcing and reliance", "Record retention", "Compliance monitoring", "Employee integrity", "Internal communication", "Training"]) {
    if (!draft.includes(h)) throw new Error("policy missing " + h);
  }
  if (!/customer and on our supplier/.test(draft)) throw new Error("HVG text missing");
  log("policy draft covers every Art. 9(2) item and the HVG sector");
  const sec = p.locator("section", { hasText: "Draft: AML/CTF policy v1" });
  await sec.getByText("Edit sections").click();
  await sec.getByLabel("11. Training").fill("All staff complete AML training on joining and every year, plus a sector module for HVG sales staff.");
  await sec.getByRole("button", { name: "Save section" }).last().click();
  await p.getByText("plus a sector module for HVG sales staff").first().waitFor();
  log("section edited");
  for (const title of ["AML/CTF policy", "AML/CTF procedures"]) {
    await p.locator("section", { hasText: `Draft: ${title} v1` }).getByRole("button", { name: "Approve and put in force" }).click();
    await p.getByRole("heading", { name: `In force: ${title} v1` }).waitFor();
  }
  log("policy and procedures approved and in force");
  await p.locator("section", { hasText: "In force: AML/CTF policy v1" }).getByRole("button", { name: /I have read and will follow this policy/ }).click();
  await p.locator("section", { hasText: "In force: AML/CTF policy v1" }).getByText("You acknowledged this version.").waitFor();
  log("acknowledged by the user");
  const [dl2] = await Promise.all([p.waitForEvent("download"), p.locator("section", { hasText: "In force: AML/CTF policy v1" }).getByRole("link", { name: "Download PDF" }).click()]);
  const pdf2 = fs.readFileSync(await dl2.path());
  if (pdf2.subarray(0, 5).toString() !== "%PDF-") throw new Error("bad policy PDF");
  fs.writeFileSync(process.env.PDF_OUT ?? "/dev/null", pdf2);
  log("policy PDF:", pdf2.length, "bytes");

  // New version: regenerating creates v2 draft while v1 stays in force
  await submit(p, "Generate new version", /Draft: AML\/CTF policy v2/);
  log("new version v2 drafted; v1 stays in force until approved");

  console.log("page errors:", errors);
  await b.close();
})().catch((e) => { console.error("✘", e.message); process.exit(1); });
