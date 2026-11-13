/* eslint-disable @typescript-eslint/no-require-imports */
// Due-diligence end-to-end (spec §11.4–11.10, §11.15). Needs the TEST list from
// e2e/fixtures/test-sanctions.csv loaded and two fresh sign-up codes:
//   CODE1=… CODE2=… node e2e/cdd-flow.cjs
const { chromium } = require("playwright");
const { BASE, log, signupFirm, submit } = require("./helpers.cjs");

(async () => {
  const b = await chromium.launch();
  const errors = [];

  // ---------------- Accountant: company client with 3-level ownership ----------------
  const { p } = await signupFirm(b, { code: process.env.CODE1, company: "Skaičiai ir partneriai", email: "owner@skaiciai.lt", sector: "ACCOUNTANT" });
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(BASE + "/app/clients/new");
  await p.getByLabel("Company / legal entity").check();
  await p.getByLabel("Legal name *").fill("Baltic Trade UAB");
  await p.getByLabel("Registration number").fill("304000000");
  await p.getByLabel("Country of creation").fill("LT");
  await p.getByLabel("Purpose and intended nature of the relationship").fill("Annual accounts and tax returns");
  await p.getByRole("button", { name: "Create client" }).click();
  await p.getByRole("heading", { name: "Baltic Trade UAB" }).waitFor();
  log("company client created");

  const addOwner = async ({ of, kind, pct, first, last, name, dob, control }) => {
    await p.getByText("Add a shareholder or controller").click();
    const f = p.locator("details", { hasText: "Add a shareholder or controller" });
    await f.locator("select[name=ownedId]").selectOption({ label: of });
    if (control) { await f.locator("select[name=linkType]").selectOption("CONTROL"); await f.getByLabel("How control is exercised (for control)").fill(control); }
    else await f.getByLabel("% held").fill(String(pct));
    if (kind === "LEGAL") { await f.getByLabel("Company / legal entity").check(); await f.getByLabel("Legal name *").fill(name); }
    else { await f.getByLabel("First names (all) *").fill(first); await f.getByLabel("Surname *").fill(last); if (dob) await f.getByLabel("Date of birth").fill(dob); }
    await f.getByRole("button", { name: "Add", exact: true }).click();
    await p.getByText("Added. Beneficial owners and screening were updated.").first().waitFor();
    await p.reload();
  };
  await addOwner({ of: "Baltic Trade UAB", kind: "LEGAL", pct: 50, name: "X Holding OÜ" });
  await addOwner({ of: "Baltic Trade UAB", kind: "NATURAL", pct: 10, first: "Anna", last: "Owner" });
  await addOwner({ of: "Baltic Trade UAB", kind: "NATURAL", pct: 40, first: "Carl", last: "Minority" });
  await addOwner({ of: "X Holding OÜ", kind: "LEGAL", pct: 60, name: "Y Invest SIA" });
  await addOwner({ of: "X Holding OÜ", kind: "NATURAL", pct: 40, first: "Ivan", last: "Sidorov", dob: "1990-01-01" });
  await addOwner({ of: "Y Invest SIA", kind: "NATURAL", pct: 100, first: "Anna", last: "Owner2" });
  const boText = await p.locator("#ownership").innerText();
  if (!/Carl Minority — 40%/.test(boText) || !/Anna Owner2 — 30%/.test(boText)) throw new Error("BO calc wrong:\n" + boText);
  if (!/Anna Owner 10%/.test(boText) || !/Ivan Sidorov 20%/.test(boText)) throw new Error("below-threshold list wrong:\n" + boText);
  log("3-level structure: Carl 40%, Anna Owner2 30% (60%×50%) are BOs; Ivan 20%, Anna 10% below threshold");

  // Screening hit on Ivan Sidorov blocks acceptance
  await p.getByText("Possible match").first().waitFor();
  log("screening hit:", (await p.getByText("Possible match").first().innerText()).slice(0, 100));
  await p.getByLabel("Company / legal entity").first().isVisible().catch(() => {});
  if (!(await p.getByText(/Resolve 1 possible screening match/).count())) throw new Error("gate missing screening item");
  // Try to accept before resolving
  await p.getByRole("button", { name: "Accept client", exact: true }).click();
  await p.getByText(/Can't accept yet/).first().waitFor();
  log("accept refused while screening match and register extract are open");
  await p.getByLabel("Reason for your decision *").fill("Different date of birth (1990 vs 1965) and nationality LT; not the listed person.");
  await submit(p, "Record decision", "Decided matches (1)");
  await p.getByLabel("Register", { exact: true }).fill("JANGIS");
  await p.getByLabel("Extract date").fill("2027-08-01");
  await submit(p, "Record extract", "Register extract recorded");
  await p.reload();
  await p.getByRole("heading", { name: "Ready to decide" }).waitFor();
  await submit(p, "Accept client", /Accepted · Risk/);
  const header = await p.locator("main p").nth(1).innerText();
  if (!/Accepted/.test(header) || !/Next refresh 20(3[1-9])/.test(header)) throw new Error("header: " + header);
  log("accepted; header:", header);

  // ---------------- PEP natural person → EDD ----------------
  await p.goto(BASE + "/app/clients/new");
  await p.getByLabel("First names (all) *").fill("Petras");
  await p.getByLabel("Surname *").fill("Politikas");
  await p.getByLabel("Nationalities").fill("LT");
  await p.getByLabel(/Politically exposed person/).check();
  await p.getByLabel("Prominent public function").fill("Member of Parliament");
  await p.getByLabel("Purpose and intended nature of the relationship").fill("Personal income tax returns");
  await p.getByRole("button", { name: "Create client" }).click();
  await p.getByRole("heading", { name: "Petras Politikas" }).waitFor();
  await p.getByRole("heading", { name: /Risk: High/ }).waitFor();
  log("PEP → risk High, EDD required");
  await p.locator("select[name=method]").selectOption("IN_PERSON");
  await p.getByLabel("Document type").fill("ID card");
  await p.getByLabel("Document number").fill("LT1234567");
  await p.getByLabel("Why national eID wasn't used").fill("Client came to the office in person");
  await submit(p, "Record verification", "Identity verification recorded.");
  await p.reload();
  for (const box of await p.locator("input[name^='edd.']").all()) await box.check();
  await submit(p, "Save checklist", "EDD checklist saved (8/8).");
  await p.reload();
  await p.getByLabel("Reasons *", { exact: true }).fill("Source of wealth: MP salary, documented; low-value tax engagement.");
  await submit(p, "Approve", "Approved.");
  await p.getByLabel("Reasons, incl. source of wealth and funds *").fill("Salary as MP, bank statements reviewed. Continue monitoring yearly.");
  await submit(p, "Approve PEP relationship", /PEP: approval to establish or continue\s*Approved\./);
  await submit(p, "Accept client", /Accepted \(EDD\)/);
  const pepHeader = await p.locator("main p").nth(1).innerText();
  if (!/Accepted \(EDD\)/.test(pepHeader) || !/Next refresh 2027-/.test(pepHeader)) throw new Error("PEP header: " + pepHeader);
  log("PEP accepted with EDD; refresh in 1 year:", pepHeader);

  // Refuse with suspicion → retention clock + tipping-off warning
  await p.goto(BASE + "/app/clients/new");
  await p.getByLabel("First names (all) *").fill("Nora");
  await p.getByLabel("Surname *").fill("Nobody");
  await p.getByRole("button", { name: "Create client" }).click();
  await p.getByRole("heading", { name: "Nora Nobody" }).waitFor();
  await p.locator("form", { hasText: "Refuse (CDD" }).getByLabel("Reason *").fill("Client would not provide ID or explain the source of funds.");
  await p.getByLabel(/Yes — report internally to the Compliance Officer/).check();
  await submit(p, "Refuse client", /Refused · Risk/);
  await p.getByText(/tipping-off is prohibited/).waitFor();
  const rh = await p.locator("main p").nth(1).innerText();
  if (!/Refused/.test(rh) || !/Delete after 2031/.test(rh)) throw new Error("refusal header: " + rh);
  log("refused with internal suspicion report; retention clock:", rh);

  // Retention: backdate the refused file, then delete it from the Records page (needs DATABASE_URL).
  if (process.env.DATABASE_URL) {
    const { execSync } = require("child_process");
    const sql = (q) => execSync(`psql "${process.env.DATABASE_URL}" -tAc ${JSON.stringify(q)}`).toString().trim();
    sql(`UPDATE "CddFile" SET "retentionUntil" = now() - interval '1 day' FROM "Party" WHERE "Party".id = "CddFile"."partyId" AND "Party"."displayName" = 'Nora Nobody'`);
    const partyId = sql(`SELECT id FROM "Party" WHERE "displayName" = 'Nora Nobody'`);
    await p.goto(BASE + "/app/records");
    await p.getByText("Nora Nobody").waitFor();
    await p.getByLabel(/permanently deleted/).check();
    await submit(p, "Delete selected records", "permanently deleted");
    const left = sql(`SELECT (SELECT count(*) FROM "Party" WHERE id = '${partyId}') || ',' || (SELECT count(*) FROM "Case" WHERE '${partyId}' = ANY("partyIds")) || ',' || (SELECT count(*) FROM "Approval" WHERE "objectId" IN (SELECT id FROM "CddFile" WHERE "partyId" = '${partyId}'))`);
    const auditRow = sql(`SELECT action || ' ' || "objectType" || ' ' || array_to_string(fields, ',') FROM "AuditEvent" WHERE "objectId" = '${partyId}' ORDER BY id DESC LIMIT 1`);
    if (left !== "0,0,0") throw new Error("purge left data: " + left);
    log("retention purge: party, case and approvals deleted; audit keeps only:", JSON.stringify(auditRow));
  }

  await p.goto(BASE + "/app/calendar");
  log("calendar:", (await p.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 200));

  // ---------------- Jewellery trader: supplier CDD, linked transactions, cash cap ----------------
  const { p: q } = await signupFirm(b, { code: process.env.CODE2, company: "Auksas UAB", email: "owner@auksas.lt", sector: "HVG_TRADER" });
  q.on("pageerror", (e) => errors.push(e.message));
  await q.goto(BASE + "/app/matters/new");
  await q.getByLabel("Title *").fill("Rolex sale");
  await q.locator("select[name=type]").selectOption("GOODS_SALE");
  await q.locator("select[name=goodsCategory]").selectOption("jewellery-watches");
  await q.getByRole("button", { name: "Create matter" }).click();
  await q.getByRole("heading", { name: "Rolex sale" }).waitFor();
  const addParty = async (role, first, last) => {
    await q.getByText("Add a party").click();
    const f = q.locator("details", { hasText: "Add a party" });
    await f.locator("select[name=role]").selectOption(role);
    await f.getByLabel("First names (all) *").fill(first);
    await f.getByLabel("Surname *").fill(last);
    await f.getByRole("button", { name: "Add party" }).click();
    await q.getByText("Party added.").first().waitFor();
    await q.reload();
  };
  await addParty("CLIENT", "Jonas", "Pirkėjas");
  let open = await q.locator("section", { hasText: "Open before completion" }).innerText();
  if (!/Add the supplier/.test(open)) throw new Error("supplier gate missing: " + open);
  log("goods sale requires supplier CDD");
  await addParty("SUPPLIER", "Sigitas", "Tiekėjas");

  const pay = async (date, amount, method) => {
    const f = q.locator("form", { hasText: "Paid by" });
    await f.locator("select[name=customerId]").selectOption({ label: "Jonas Pirkėjas (client)" });
    await f.getByLabel("Date").fill(date);
    await f.getByLabel("Amount (EUR)").fill(String(amount));
    await f.locator("select[name=method]").selectOption(method);
    await f.getByRole("button", { name: "Record" }).click();
  };
  await pay("2027-08-01", 4000, "bank-transfer"); await q.getByText("No CDD trigger").first().waitFor(); await q.reload();
  await pay("2027-08-10", 4000, "bank-transfer"); await q.getByText("No CDD trigger").first().waitFor(); await q.reload();
  await pay("2027-08-20", 4000, "bank-transfer"); await q.getByText(/CDD required: 3 linked occasional transactions total €12,000/).first().waitFor();
  log("linked-transaction test: third €4,000 payment triggers CDD");
  await q.reload();
  await pay("2027-08-21", 12000, "cash"); await q.getByText(/Cash payments of €10,000 or more are not allowed/).first().waitFor();
  log("cash €12,000 blocked by cash cap");
  await q.reload();
  await pay("2027-08-21", 3000, "cash"); await q.getByText(/Cash payments of €3,000 reach the €3,000 identification threshold/).first().waitFor();
  log("cash €3,000 triggers identification (Art. 19(4))");
  await q.reload();
  await submit(q, "Mark matter completed", "Not yet:");
  log("matter can't complete while CDD is open");

  console.log("page errors:", errors);
  await b.close();
})().catch((e) => { console.error("✘", e.message); process.exit(1); });
