/* eslint-disable @typescript-eslint/no-require-imports */
// Client portal end-to-end (spec §4A.1, §8C.5, §11.5, §11.14 portal items).
//   CODE=… node e2e/portal-flow.cjs     (server with EMAIL_TRANSPORT=dev, SCAN_MODE=basic)
const { chromium } = require("playwright");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { BASE, log, signupFirm, submit, lastMail } = require("./helpers.cjs");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "portal-"));
const file = (name, bytes) => { const p = path.join(tmp, name); fs.writeFileSync(p, bytes); return p; };
const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000" + "1f15c4890000000d49444154789c6360000002000100e221bc330000000049454e44ae426082", "hex");
const EICAR = "%PDF-1.4\nX5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*\n";

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const { p } = await signupFirm(b, { code: process.env.CODE, company: "Namai UAB", email: "owner@namai.lt", sector: "ESTATE_AGENT" });
  p.on("pageerror", (e) => errors.push(e.message));

  // Staff: create client with only name + email, send link
  await p.goto(BASE + "/app/clients/new");
  await p.getByLabel("First names (all) *").fill("Rasa");
  await p.getByLabel("Surname *").fill("Pirkėja");
  await p.getByLabel("Email").fill("rasa@example.lt");
  await p.getByRole("button", { name: "Create client" }).click();
  await p.getByRole("heading", { name: "Rasa Pirkėja" }).waitFor();
  const fileUrl = p.url();
  await submit(p, "Send link", "Secure link sent to rasa@example.lt");
  log("staff created client with name + email and sent portal link");

  // Client: open link in a separate browser
  const c = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage(); // phone size
  c.on("pageerror", (e) => errors.push(e.message));
  const link = await lastMail(c, "rasa@example.lt");
  if (/rasa|Pirk/i.test(link)) throw new Error("personal data in link");
  await c.goto(link);
  await c.getByText(/one-time code to r•••@example.lt/).waitFor();
  log("link opens a code page only (no data before the code); URL has no personal data");
  await submit(c, "Send me a code", "We've sent a 6-digit code");
  await c.getByLabel("6-digit code *").fill("000000");
  await submit(c, "Continue", "That code is not correct.");
  const codeMail = await (async () => { await c.goto(BASE + "/dev/mailbox"); return c.locator('article[data-to="rasa@example.lt"] pre').first().innerText(); })();
  const code = codeMail.match(/\b\d{6}\b/)[0];
  await c.goto(link);
  await c.getByLabel("6-digit code *").fill(code);
  await c.getByRole("button", { name: "Continue" }).click();
  await c.getByRole("heading", { name: /Your information for Namai UAB/ }).waitFor();
  log("wrong code refused; correct code opens the portal");

  // Uploads
  const upload = async (kindLabel, p_, expect) => {
    await c.locator("select[name=kind]").selectOption({ label: kindLabel });
    await c.locator("input[type=file]").setInputFiles(p_);
    await submit(c, "Upload", expect);
  };
  await upload("Identity document", file("virus.pdf", EICAR), "blocked by the malware scan");
  log("EICAR test file quarantined");
  await upload("Identity document", file("tool.exe", Buffer.from("MZ\x90\x00 binary")), "Only PDF, JPG, PNG, HEIC and DOCX");
  await upload("Identity document", file("fake.pdf", Buffer.from("MZ\x90\x00 binary")), "Only PDF, JPG, PNG, HEIC and DOCX");
  log("disallowed and disguised file types refused");
  await upload("Identity document", file("passport.png", PNG), "Uploaded.");
  log("PNG ID uploaded");

  // Save draft, submit incomplete, then complete
  await c.getByLabel("Date of birth *").fill("1985-03-14");
  await c.getByRole("button", { name: "Save for later" }).click();
  await c.getByText("Saved. You can come back").first().waitFor();
  await c.reload();
  if ((await c.getByLabel("Date of birth *").inputValue()) !== "1985-03-14") throw new Error("draft not kept");
  log("draft saved and restored");
  await c.getByRole("button", { name: "Submit", exact: true }).click();
  await c.getByText("Check the highlighted fields.").first().waitFor();
  log("incomplete submission refused");
  await c.getByLabel("Place of birth *").fill("Kaunas");
  await c.getByLabel("Nationalities *").fill("LT");
  await c.getByLabel("Country of residence *").fill("LT");
  await c.getByLabel("Residential address *").fill("Laisvės al. 1, Kaunas");
  await c.locator('input[name=isPep][value=no]').check();
  await c.locator('input[name=isPepFamilyOrAssociate][value=no]').check();
  await c.locator('input[name=actingForOther][value=no]').check();
  await c.getByLabel("What do you need the service for? *").fill("Buying a flat in Vilnius to live in");
  await c.getByLabel("Where does the money for this come from? *").fill("Savings from salary and a mortgage from SEB");
  await c.getByRole("button", { name: "Submit", exact: true }).click();
  await c.getByText("Confirm the declaration").first().waitFor();
  await c.getByLabel(/I confirm that the information/).check();
  await c.getByLabel("Type your full name to sign").fill("Rasa Pirkėja");
  await c.getByRole("button", { name: "Submit", exact: true }).click();
  await c.getByRole("heading", { name: "Thank you" }).waitFor();
  log("submitted with declaration and typed signature");
  await c.goto(link);
  await c.getByRole("heading", { name: "Thank you" }).waitFor();
  log("link shows only 'Thank you' after submission (no data)");

  // Staff sees the result
  await p.goto(fileUrl);
  const page = await p.locator("main").innerText();
  for (const s of ["Kaunas", "Savings from salary", "Declaration signed by Rasa Pirkėja", "passport.png", "from client", "submitted"]) {
    if (!page.includes(s)) throw new Error("staff page missing: " + s);
  }
  if (!page.includes("blocked by malware scan")) throw new Error("quarantine not shown");
  const dl = await Promise.all([p.waitForEvent("download"), p.getByRole("link", { name: "passport.png" }).click()]);
  const bytes = fs.readFileSync(await dl[0].path());
  if (!bytes.equals(PNG)) throw new Error("download differs");
  log("staff sees declared data, signature, documents; download returns the original file (decrypted)");
  await p.goto(BASE + "/app/calendar");
  await p.getByText("Review client portal submission").waitFor();
  log("review task in the calendar");

  // Revoked link shows nothing
  await p.goto(fileUrl);
  await submit(p, "Send link", "Secure link sent");
  await p.reload();
  await p.getByRole("button", { name: "Revoke" }).first().click();
  await p.getByText("Link revoked.").first().waitFor().catch(() => {});
  const link2 = await lastMail(c, "rasa@example.lt").then(() => null).catch(() => null);
  const mails = await (async () => { await c.goto(BASE + "/dev/mailbox"); return c.locator('article[data-to="rasa@example.lt"] pre').allInnerTexts(); })();
  const newest = mails.map((m) => m.match(/http\S+\/p\/\S+/)?.[0]).filter(Boolean)[0];
  await c.goto(newest);
  await c.getByRole("heading", { name: "This link is no longer valid" }).waitFor();
  log("revoked link shows no data", link2 ?? "");

  // Unauthenticated file access
  const r = await (await b.newContext()).request.get(BASE + "/api/files/" + "00000000-0000-0000-0000-000000000000");
  log("anonymous file request status:", r.status());

  console.log("page errors:", errors);
  await b.close();
})().catch((e) => { console.error("✘", e.message); process.exit(1); });
