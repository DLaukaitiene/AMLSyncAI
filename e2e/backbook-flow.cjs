/* eslint-disable @typescript-eslint/no-require-imports */
// Back-book import (spec §11.4): 1,000 clients in ≤ 5 minutes, gap list, high-risk first.   CODE=… node e2e/backbook-flow.cjs
const { chromium } = require("playwright");
const fs = require("fs");
const { BASE, log, signupFirm, submit } = require("./helpers.cjs");

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const { p } = await signupFirm(b, { code: process.env.CODE, company: "Didelė apskaita UAB", email: "owner@didele.lt", sector: "ACCOUNTANT" });
  p.on("pageerror", (e) => errors.push(e.message));
  const head = "type,first_names,last_name,name,birth_date,nationalities,residence_country,address,registration_number,country,email,purpose,last_cdd_date,pep,documents";
  const rows = [];
  for (let i = 0; i < 1000; i++) {
    if (i === 500) rows.push("person,Petras,Politikas,,1960-01-01,LT,LT,Vilnius,,,,Tax,2022-01-01,yes,id");
    else if (i % 3 === 0) rows.push(`company,,,Client Company ${i} UAB,,,,,30${String(i).padStart(7, "0")},LT,,Bookkeeping,2020-06-01,,extract`);
    else rows.push(`person,First${i},Last${i},,1980-01-${String((i % 28) + 1).padStart(2, "0")},LT,LT,Street ${i},,,,Tax returns,2024-01-01,,id`);
  }
  rows.push("person,,,Bad Row,14.03.1985,,,,,,,,,,");
  fs.writeFileSync("/tmp/backbook.csv", [head, ...rows].join("\n"));

  await p.goto(BASE + "/app/remediation");
  await p.locator("input[type=file]").setInputFiles("/tmp/backbook.csv");
  await submit(p, "Import", "row(s) have problems");
  log("bad row blocks the import with its line number:", await p.getByText(/Line 1002/).innerText());
  await p.reload();
  await p.locator("input[type=file]").setInputFiles("/tmp/backbook.csv");
  await p.getByLabel("Import the valid rows and skip the others").check();
  const t = Date.now();
  await p.getByRole("button", { name: "Import" }).click();
  await p.getByText(/Imported 1000 client\(s\)/).first().waitFor({ timeout: 300_000 });
  const secs = Math.round((Date.now() - t) / 1000);
  if (secs > 300) throw new Error(`took ${secs}s`);
  log(`1,000 clients imported, screened and scored in ${secs} s`);
  await p.reload();
  const first = await p.locator("tbody tr").first().innerText();
  if (!/Petras Politikas/.test(first) || !/High/.test(first)) throw new Error("PEP not first: " + first);
  log("high-risk (PEP) file is at the top:", first.replace(/\s+/g, " "));
  const companyRow = await p.locator("tbody tr", { hasText: "Client Company 3 UAB" }).innerText();
  if (!/Beneficial owners/.test(companyRow) || !/more than 5 years/.test(companyRow)) throw new Error("company gaps: " + companyRow);
  log("company gaps:", companyRow.replace(/\s+/g, " "));
  await p.getByRole("link", { name: "Petras Politikas" }).click();
  await p.getByText(/Existing client being brought up to the new CDD standard/).waitFor();
  log("client file shows the remediation banner");
  console.log("page errors:", errors);
  await b.close();
})().catch((e) => { console.error("✘", e.message); process.exit(1); });
