/* eslint-disable @typescript-eslint/no-require-imports */
// One request link per company: the representative lists directors and owners, uploads documents, signs;
// staff review each declared person before it enters the structure.
//   CODE=… node e2e/company-request-flow.cjs
const { chromium } = require("playwright");
const fs = require("fs");
const { BASE, log, signupFirm, submit, lastMail } = require("./helpers.cjs");

const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000" + "1f15c4890000000d49444154789c6360000002000100e221bc330000000049454e44ae426082", "hex");

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const { p } = await signupFirm(b, { code: process.env.CODE, company: "Apskaita UAB", email: "owner@apskaita.lt", sector: "ACCOUNTANT" });
  p.on("pageerror", (e) => errors.push(e.message));

  await p.goto(BASE + "/app/clients/new");
  await p.getByRole("radio", { name: "Company or other organisation" }).check();
  await p.getByLabel("Legal name *").fill("Prašymo UAB");
  await p.getByLabel("Registration number").fill("300111222");
  await p.getByRole("button", { name: "Create client" }).click();
  await p.getByRole("heading", { name: "Prašymo UAB" }).waitFor();
  const fileUrl = p.url().split("?")[0];
  await p.goto(fileUrl + "?tab=documents#documents");
  await p.getByLabel("Send the company's representative a request").fill("rep@prasymo.lt");
  await submit(p, "Send link", "Secure link sent to rep@prasymo.lt");
  const mail = await (async () => { await p.goto(BASE + "/dev/mailbox"); return p.locator('article[data-to="rep@prasymo.lt"]').first().innerText(); })();
  if (!/list its directors, shareholders and beneficial owners/.test(mail)) throw new Error("✘ company request email: " + mail.slice(0, 300));
  log("one request sent to the company's representative, explaining what is needed");

  // Representative
  const c = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  c.on("pageerror", (e) => errors.push(e.message));
  const link = await lastMail(c, "rep@prasymo.lt");
  await c.goto(link);
  await submit(c, "Send me a code", "We've sent a 6-digit code");
  await c.goto(BASE + "/dev/mailbox");
  const code = (await c.locator('article[data-to="rep@prasymo.lt"] pre').first().innerText()).match(/\b\d{6}\b/)[0];
  await c.goto(link);
  await c.getByLabel("6-digit code *").fill(code);
  await c.getByRole("button", { name: "Continue" }).click();
  await c.getByRole("heading", { name: /Your information for Apskaita UAB/ }).waitFor();

  fs.writeFileSync("/tmp/jonas-id.png", PNG);
  await c.locator("select[name=kind]").selectOption({ label: "Identity document" });
  await c.getByLabel("Whose document? (for an ID or proof of address)").fill("Jonas Savininkas");
  await c.locator("input[type=file]").setInputFiles("/tmp/jonas-id.png");
  await submit(c, "Upload", "Uploaded.");

  await c.getByLabel("Legal name *").fill("Prašymo UAB");
  await c.getByLabel("Registration number *").fill("300111999");
  await c.getByLabel("Registered office country *").fill("LT");
  await c.getByLabel("Your role in the company *").fill("Director");
  await c.getByLabel("Registered office address *").fill("Gedimino pr. 5, Vilnius");
  await c.getByLabel("What the company does *").fill("Wholesale of building materials");
  await c.locator("input[name=sanctions][value=no]").check();
  const row = (i) => c.getByTestId(`person-${i}`);
  await row(0).getByLabel("Full name").fill("Jonas Savininkas");
  await row(0).getByLabel("% of shares held directly").fill("60");
  await row(0).getByLabel("Date of birth (people)").fill("1975-04-02");
  await row(0).getByLabel("Nationality / country of registration").fill("Lithuania");
  await row(0).getByLabel("Email (for the identity check)").fill("jonas@prasymo.lt");
  await row(0).getByLabel("Director / board member").check();
  await row(0).locator("input[name=p0_pep][value=no]").check();
  await row(1).getByLabel("Full name").fill("Petras Vadovas");
  await row(1).getByLabel("Date of birth (people)").fill("1981-09-12");
  await row(1).getByLabel("Director / board member").check();
  await row(1).locator("input[name=p1_pep][value=yes]").check();
  await row(1).getByLabel("If yes, which function?").fill("Member of the municipal council");
  await row(2).getByLabel("Full name").fill("Holding SIA");
  await row(2).getByLabel("Type").selectOption("company");
  await row(2).getByLabel("% of shares held directly").fill("50");
  await row(2).getByLabel("Shareholder", { exact: true }).check();
  await c.getByLabel("What do you need the service for? *").fill("Bookkeeping and annual accounts");
  await c.getByLabel("Where does the money for this come from? *").fill("Revenue from sales");
  await c.getByLabel(/I confirm that the information/).check();
  await c.getByLabel("Type your full name to sign").fill("Petras Vadovas");
  await c.getByRole("button", { name: "Submit", exact: true }).click();
  await c.getByText(/Shareholdings add up to 110%/).first().waitFor();
  log("percentages over 100% refused");
  await row(2).getByLabel("% of shares held directly").fill("40");
  await c.getByLabel(/I confirm that the information/).check();
  await c.getByLabel("Type your full name to sign").fill("Petras Vadovas");
  await c.getByRole("button", { name: "Submit", exact: true }).click();
  await c.getByRole("heading", { name: "Thank you" }).waitFor();
  log("representative listed 3 people (director-owner, PEP director, corporate shareholder), uploaded an ID, signed");

  // Staff review
  await p.goto(fileUrl + "?tab=verification#identity");
  await p.getByTestId("client-declared-note").waitFor();
  const people = p.getByTestId("register-people").last();
  await people.getByText("Jonas Savininkas").waitFor();
  await people.getByText(/declared PEP: Member of the municipal council/).waitFor();
  if (await p.locator("main").innerText().then((t) => /Jonas Savininkas[^\n]*In the structure/.test(t))) throw new Error("✘ added automatically");
  await people.locator("li", { hasText: "Jonas Savininkas" }).getByRole("button", { name: "Add to ownership" }).click();
  await people.locator("li", { hasText: "Jonas Savininkas" }).getByText("In the structure").waitFor();
  await people.locator("li", { hasText: "Petras Vadovas" }).getByRole("button", { name: "Add as director" }).click();
  await people.locator("li", { hasText: "Petras Vadovas" }).getByText("In the structure").waitFor();
  log("nothing added automatically; staff added the owner-director and the director after review");

  await p.goto(fileUrl);
  const main = await p.locator("main").innerText();
  if (!/director/.test(main) || !main.includes("60%")) throw new Error("✘ structure missing director / 60%");
  const prop = p.getByTestId("client-proposed");
  await prop.getByText("300111999").waitFor();
  await prop.getByRole("button", { name: "Use client's value" }).click();
  await p.getByText("300111999").first().waitFor();
  await p.goto(fileUrl + "?tab=documents#documents");
  await p.getByText("Jonas Savininkas – jonas-id.png").waitFor();
  log("structure shows the 60% owner and the directors; the different registration number was offered and taken over; the ID is labelled with the person's name");

  console.log("page errors:", errors);
  await b.close();
})().catch((e) => { console.log("✘", e.message); process.exit(1); });
