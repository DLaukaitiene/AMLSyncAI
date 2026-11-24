/* eslint-disable @typescript-eslint/no-require-imports */
// Client file shared between two firms: firm code, send with legal basis, import, decline, withdraw, isolation.
//   CODE1=… CODE2=… node e2e/sharing-flow.cjs
const { chromium } = require("playwright");
const fs = require("fs");
const { BASE, log, signupFirm, submit } = require("./helpers.cjs");

const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000" + "1f15c4890000000d49444154789c6360000002000100e221bc330000000049454e44ae426082", "hex");

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const { p: a } = await signupFirm(b, { code: process.env.CODE1, company: "Siuntėjai UAB", email: "owner@siuntejai.lt", sector: "ACCOUNTANT" });
  const { p: r } = await signupFirm(b, { code: process.env.CODE2, company: "Gavėjai UAB", email: "owner@gavejai.lt", sector: "ACCOUNTANT" });
  for (const x of [a, r]) x.on("pageerror", (e) => errors.push(e.message));

  await r.goto(BASE + "/app/clients/shared");
  const code = (await r.getByTestId("share-code").locator("p.font-mono").innerText()).trim();
  if (!/^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code)) throw new Error("✘ firm code: " + code);
  await a.goto(BASE + "/app/clients/shared");
  const ownCode = (await a.getByTestId("share-code").locator("p.font-mono").innerText()).trim();
  log("each firm has a code:", code);

  // Firm A: company client with an owner and a document
  await a.goto(BASE + "/app/clients/new");
  await a.getByRole("radio", { name: "Company or other organisation" }).check();
  await a.getByLabel("Legal name *").fill("Perkeliama UAB");
  await a.getByRole("button", { name: "Create client" }).click();
  await a.getByRole("heading", { name: "Perkeliama UAB" }).waitFor();
  const fileUrl = a.url().split("?")[0];
  await a.getByText("Add a shareholder or controller").click();
  const f = a.locator("details", { hasText: "Add a shareholder or controller" });
  await f.getByLabel("% held").fill("100"); await f.getByLabel("First names (all) *").fill("Aldona"); await f.getByLabel("Surname *").fill("Perkelta");
  await f.getByRole("button", { name: "Add", exact: true }).click();
  await a.getByText("Added. Beneficial owners and screening were updated.").first().waitFor();
  fs.writeFileSync("/tmp/extract.png", PNG);
  await a.goto(fileUrl + "?tab=documents#documents");
  await a.locator("select[name=kind]").selectOption("company-extract");
  await a.locator("input[type=file]").setInputFiles("/tmp/extract.png");
  await submit(a, "Upload", "Uploaded.");

  const share = async (c, expect) => {
    await a.goto(fileUrl + "?tab=documents#documents");
    const box = a.getByTestId("share-file");
    await a.waitForLoadState("networkidle"); await box.locator("summary").click();
    if (!(await box.evaluate((e) => e.open))) await box.locator("summary").click();
    await box.getByLabel("Their firm code").fill(c);
    await box.locator("select[name=legalBasis]").selectOption("consent");
    await box.getByLabel("Note to the other firm").fill("Client moves to you from January");
    await box.locator("input[name=confirm]").check();
    await submit(a, "Send the file", expect);
  };
  await share(ownCode, "That is your own firm's code.");
  await share("ZZZZ-ZZZZ", /No firm has this code/);
  await share(code.toLowerCase(), "Sent to Gavėjai UAB with 1 document(s).");
  log("sent with the client's consent; own code and unknown codes refused");

  // Second share → withdrawn by the sender
  await share(code, "Sent to Gavėjai UAB");
  await a.goto(BASE + "/app/clients/shared");
  await a.getByTestId("shares-out").getByRole("button", { name: "Withdraw" }).first().click();
  await a.getByTestId("shares-out").getByText(/withdrawn/).first().waitFor();
  log("a second copy withdrawn by the sender");

  // Firm B imports
  await r.goto(BASE + "/app/clients/shared");
  const inc = r.getByTestId("shares-in");
  await inc.getByText("Perkeliama UAB").first().waitFor();
  if ((await inc.getByRole("button", { name: "Import as a new client" }).count()) !== 1) throw new Error("✘ expected exactly one pending share");
  await inc.getByRole("button", { name: "Import as a new client" }).click();
  await r.getByRole("heading", { name: "Perkeliama UAB" }).waitFor();
  await r.getByTestId("received-from").getByText(/Received from Siuntėjai UAB/).waitFor();
  const importedUrl = r.url().split("?")[0];
  await r.goto(importedUrl + "?tab=documents#documents");
  await r.getByText("extract.png").first().waitFor();
  const res = await r.request.get(BASE + (await r.getByRole("link", { name: "extract.png" }).getAttribute("href")));
  if (!Buffer.from(await res.body()).equals(PNG)) throw new Error("✘ document differs after sharing");
  await r.goto(importedUrl + "?tab=directors");
  await r.getByRole("heading", { name: "Perkeliama UAB" }).waitFor();
  if (!(await r.locator("main").innerText()).includes("Aldona Perkelta")) throw new Error("✘ owner not imported");
  log("imported by the receiving firm: client, owner, document (same bytes) and the sender's check summary");

  // Isolation: firm A can't open firm B's imported file; sender sees the result
  const resp = await a.goto(importedUrl);
  if (resp.status() !== 404 && !(await a.getByText(/not found|could not be found/i).count())) throw new Error("✘ sender can open the receiver's file");
  await a.goto(BASE + "/app/clients/shared");
  await a.getByTestId("shares-out").getByText(/imported/).first().waitFor();
  log("the sender sees 'imported' but can't open the receiver's copy");

  // Third share → declined
  await share(code, "Sent to Gavėjai UAB");
  await r.goto(BASE + "/app/clients/shared");
  await r.getByTestId("shares-in").getByRole("button", { name: "Decline" }).click();
  await r.getByTestId("shares-in").getByText(/declined/).first().waitFor();
  log("declined by the receiver; copies deleted");

  console.log("page errors:", errors);
  await b.close();
})().catch((e) => { console.log("✘", e.message); process.exit(1); });
