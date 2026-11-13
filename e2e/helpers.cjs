/* eslint-disable @typescript-eslint/no-require-imports */
const crypto = require("crypto");

const BASE = process.env.BASE ?? "http://localhost:3100";
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function b32d(s) { let bits = 0, v = 0; const o = []; for (const c of s.replace(/\s/g, "")) { v = (v << 5) | B32.indexOf(c); bits += 5; if (bits >= 8) { o.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(o); }
function totp(secret) { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000))); const h = crypto.createHmac("sha1", b32d(secret)).update(b).digest(); const o = h[h.length - 1] & 15; return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, "0"); }
async function lastMail(page, to) { await page.goto(BASE + "/dev/mailbox"); const t = await page.locator(`article[data-to="${to}"] pre`).first().innerText(); return t.match(/http\S+/)[0]; }
const log = (...a) => console.log("✔", ...a);

/** Signs up a firm and returns a page signed in as its Owner/Compliance Officer. */
async function signupFirm(browser, { code, company, email, sector, state = "LT" }) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const p = await ctx.newPage();
  await p.goto(BASE + "/signup");
  await p.getByLabel("Sign-up code *", { exact: true }).fill(code);
  await p.getByLabel("Company name *", { exact: true }).fill(company);
  await p.locator("select[name=memberState]").selectOption(state);
  await p.locator("select[name=sector]").selectOption(sector);
  await p.getByLabel("Your name *", { exact: true }).fill("Owner of " + company);
  await p.getByLabel("Company email *", { exact: true }).fill(email);
  await p.getByLabel("Password *", { exact: true }).fill("correct horse battery staple");
  await p.getByRole("button", { name: "Create account" }).click();
  await p.getByRole("heading", { name: "Check your email" }).waitFor();
  await p.goto(await lastMail(p, email));
  await p.getByRole("button", { name: "Confirm and continue" }).click();
  await p.getByRole("heading", { name: "Set up two-factor authentication" }).waitFor();
  await p.getByText("Can't scan?").click();
  const secret = (await p.locator("details code").innerText()).replace(/\s/g, "");
  await p.getByLabel("6-digit code").fill(totp(secret));
  await p.getByRole("button", { name: /Turn on/ }).click();
  await p.getByTestId("recovery-codes").waitFor();
  await p.getByRole("link", { name: /continue/ }).click();
  await p.getByRole("heading", { name: "Dashboard" }).waitFor();
  return { p, ctx, secret };
}

/** Submits the form containing `buttonName` and waits for its status/alert message. */
async function submit(p, buttonName, expect) {
  await p.getByRole("button", { name: buttonName, exact: true }).first().click();
  if (!expect) return;
  try {
    await p.getByText(expect).first().waitFor({ timeout: 15000 });
  } catch {
    const alerts = await p.locator("form [role=alert], form [role=status]").allInnerTexts();
    throw new Error(`Expected "${expect}" after "${buttonName}". Messages on page: ${JSON.stringify(alerts)}`);
  }
}

module.exports = { BASE, totp, lastMail, log, signupFirm, submit };
