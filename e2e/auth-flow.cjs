/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require('playwright');
const crypto = require('crypto');
const BASE = process.env.BASE ?? 'http://localhost:3100';
// Run against a server started with EMAIL_TRANSPORT=dev and a fresh sign-up code in $CODE.
// Usage: CODE=XXXX-XXXX-XXXX BASE=http://localhost:3100 node e2e/auth-flow.cjs
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32d(s){let bits=0,v=0,o=[];for(const c of s.replace(/\s/g,'')){v=(v<<5)|B32.indexOf(c);bits+=5;if(bits>=8){o.push((v>>>(bits-8))&255);bits-=8;}}return Buffer.from(o);}
function totp(secret, offset=0){const ctr=Math.floor(Date.now()/30000)+offset;const b=Buffer.alloc(8);b.writeBigUInt64BE(BigInt(ctr));const h=crypto.createHmac('sha1',b32d(secret)).update(b).digest();const o=h[h.length-1]&15;return String((h.readUInt32BE(o)&0x7fffffff)%1e6).padStart(6,'0');}
async function lastMail(page, to){await page.goto(BASE+'/dev/mailbox');const t=await page.locator(`article[data-to="${to}"] pre`).first().innerText();return t.match(/http\S+/)[0];}
const log=(...a)=>console.log('✔',...a);

(async()=>{
  const b = await chromium.launch();
  const errors=[];
  const ctx = await b.newContext({viewport:{width:1200,height:900}});
  const p = await ctx.newPage();
  p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});

  // 1. Free email refused
  await p.goto(BASE+'/signup');
  const fill = async (data) => { for (const [l,v] of Object.entries(data)) await p.getByLabel(l, {exact:true}).fill(v); };
  await fill({'Sign-up code *':process.env.CODE,'Company name *':'Jonaitis ir partneriai','Your name *':'Anna Jonaitė','Company email *':'anna@gmail.com','Password *':'correct horse battery staple'});
  await p.locator('select[name=memberState]').selectOption('LT'); await p.locator('select[name=sector]').selectOption('ACCOUNTANT');
  await p.getByRole('button',{name:'Create account'}).click();
  await p.getByText('Free email providers are not accepted').first().waitFor();
  log('free email refused');

  // 2. Company domain different from name accepted
  await p.getByLabel('Company email *',{exact:true}).fill('anna@jip.lt');
  await p.getByLabel('Password *',{exact:true}).fill('correct horse battery staple');
  await p.getByLabel('Sign-up code *',{exact:true}).fill(process.env.CODE.toLowerCase());
  await p.getByRole('button',{name:'Create account'}).click();
  await p.getByRole('heading',{name:'Check your email'}).waitFor();
  log('sign-up accepted (jip.lt, lowercase code)');

  // 3. Confirm
  const link = await lastMail(p,'anna@jip.lt');
  await p.goto(link);
  await p.getByRole('button',{name:'Confirm and continue'}).click();
  await p.getByRole('heading',{name:'Set up two-factor authentication'}).waitFor();
  log('email confirmed → MFA setup');

  // 4. Dashboard blocked before MFA
  await p.goto(BASE+'/app'); await p.waitForURL(/mfa\/setup/); log('app blocked until MFA set up');

  // 5. Enroll TOTP
  await p.getByText("Can't scan?").click();
  const secret = (await p.locator('details code').innerText()).replace(/\s/g,'');
  await p.getByLabel('6-digit code').fill('000000'); await p.getByRole('button',{name:/Turn on/}).click();
  await p.getByText('That code is not correct').first().waitFor(); log('wrong TOTP refused');
  await p.getByLabel('6-digit code').fill(totp(secret)); await p.getByRole('button',{name:/Turn on/}).click();
  await p.getByTestId('recovery-codes').waitFor();
  const recovery = (await p.getByTestId('recovery-codes').innerText()).split('\n').map(s=>s.trim()).filter(Boolean);
  log('MFA on,', recovery.length, 'recovery codes');
  await p.getByRole('link',{name:/continue/}).click();
  await p.getByRole('heading',{name:'Dashboard'}).waitFor();
  await p.getByText('Finish setting up your Country Profile').first().waitFor();
  log('dashboard shows country-profile checklist');
  

  // 6. Country profile: relaxing rejected, tightening saved
  await p.goto(BASE+'/app/settings/country-profile');
  await p.getByLabel('Cash cap (EUR)').fill('15000');
  await p.getByRole('button',{name:'Save new version'}).click();
  await p.getByText('cannot exceed the EU cap').first().waitFor(); log('cash cap 15,000 rejected');
  await p.getByLabel('Cash cap (EUR)').fill('5000');
  await p.getByLabel('FIU name').fill('FNTT');
  await p.getByLabel('FIU reporting channel').fill('https://www.fntt.lt');
  await p.getByLabel('Public holidays').fill('2027-12-24\n2027-12-25');
  await p.getByRole('button',{name:'Save new version'}).click();
  await p.getByText('Saved as version 2').first().waitFor();
  log('country profile v2:', await p.getByText('Saved as version 2').first().innerText());
  

  // 7. Invite: other domain refused, same domain ok
  await p.goto(BASE+'/app/team');
  await p.getByLabel('Name *').fill('Bob'); await p.getByLabel('Email *').fill('bob@other.lt');
  await p.getByRole('button',{name:'Send invitation'}).click();
  await p.getByText('Invitations must use an @jip.lt address').first().waitFor(); log('external invite refused without opt-in');
  await p.getByLabel('Name *').fill('Bob Staff'); await p.getByLabel('Email *').fill('bob@jip.lt');
  await p.getByRole('button',{name:'Send invitation'}).click();
  await p.getByText('Invitation sent to bob@jip.lt').first().waitFor(); log('staff invited');

  // 8. Bob accepts in a fresh browser
  const ctx2 = await b.newContext(); const q = await ctx2.newPage();
  const inv = await lastMail(q,'bob@jip.lt'); await q.goto(inv);
  await q.getByLabel('Choose a password *').fill('another long passphrase 42'); await q.getByRole('button',{name:'Accept invitation'}).click();
  await q.getByRole('heading',{name:'Set up two-factor authentication'}).waitFor();
  await q.getByText("Can't scan?").click();
  const bsecret=(await q.locator('details code').innerText()).replace(/\s/g,'');
  await q.getByLabel('6-digit code').fill(totp(bsecret)); await q.getByRole('button',{name:/Turn on/}).click();
  await q.getByTestId('recovery-codes').waitFor(); await q.getByRole('link',{name:/continue/}).click();
  await q.getByRole('heading',{name:'Dashboard'}).waitFor(); log('Bob joined with MFA');
  // invitation reuse
  await q.goto(inv); await q.getByText('Invitation not valid').first().waitFor(); log('invitation works once');
  // Staff permissions
  await q.goto(BASE+'/app'); const nav = await q.getByRole('navigation',{name:'Main'}).innerText();
  if (/Records|Security log/.test(nav)) throw new Error('staff sees restricted nav');
  const r = await q.goto(BASE+'/app/records'); log('staff /app/records status', r.status());
  await q.goto(BASE+'/app/settings/country-profile'); await q.getByText('Only a Compliance Officer can change').first().waitFor(); log('staff cannot edit Country Profile');

  // Bot challenge: a login without the solved proof-of-work is refused
  {
    const x = await (await b.newContext()).newPage();
    await x.goto(BASE + "/login");
    await x.getByLabel("Email *").fill("anna@jip.lt"); await x.getByLabel("Password *").fill("correct horse battery staple");
    await x.evaluate(() => document.querySelectorAll("input[name=pow_token],input[name=pow_solution]").forEach((e) => e.remove()));
    await x.getByRole("button", { name: "Continue" }).click();
    await x.getByText("Security check failed").first().waitFor();
    log("login without the bot challenge is refused");
  }

  // 9. Logout + login with recovery code, enumeration check
  await p.getByRole('button',{name:'Sign out',exact:true}).click(); await p.waitForURL(/login/);
  await p.getByLabel('Email *').fill('nobody@jip.lt'); await p.getByLabel('Password *').fill('whatever whatever');
  await p.getByRole('button',{name:'Continue'}).click(); const e1 = await p.locator('form [role=alert]').innerText();
  await p.getByLabel('Email *').fill('anna@jip.lt'); await p.getByLabel('Password *').fill('wrong password here');
  await p.getByRole('button',{name:'Continue'}).click(); await p.waitForTimeout(500); const e2 = await p.locator('form [role=alert]').innerText();
  if (e1 !== e2) throw new Error('enumeration: '+e1+' vs '+e2); log('same error for unknown and wrong password:', e1);
  await p.getByLabel('Password *').fill('correct horse battery staple'); await p.getByRole('button',{name:'Continue'}).click();
  await p.waitForURL(/login\/mfa/);
  await p.getByLabel(/6-digit code/).fill(recovery[0]); await p.getByRole('button',{name:'Sign in'}).click();
  await p.getByRole('heading',{name:'Dashboard'}).waitFor(); log('signed in with recovery code');
  await p.getByRole('button',{name:'Sign out',exact:true}).click(); await p.waitForURL(/login/);
  await p.getByLabel('Email *').fill('anna@jip.lt'); await p.getByLabel('Password *').fill('correct horse battery staple'); await p.getByRole('button',{name:'Continue'}).click();
  await p.waitForURL(/login\/mfa/); await p.getByLabel(/6-digit code/).fill(recovery[0]); await p.getByRole('button',{name:'Sign in'}).click();
  await p.getByText('That code is not correct').first().waitFor(); log('recovery code is single-use');
  await p.getByLabel(/6-digit code/).fill(totp(secret)); await p.getByRole('button',{name:'Sign in'}).click();
  await p.getByRole('heading',{name:'Dashboard'}).waitFor(); log('signed in with TOTP');
  await p.goto(BASE+'/app/security'); log('security log rows:', await p.locator('tbody tr').count());

  console.log('console errors:', errors);
  await b.close();
})().catch(e=>{console.error('✘',e.message);process.exit(1);});
