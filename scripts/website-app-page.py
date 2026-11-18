"""Builds app.html (AMLSync App product page) from services.html's head/header/footer."""
import re, pathlib, sys
root = pathlib.Path(sys.argv[1])
s = (root / "services.html").read_text()
title = "AMLSync App — AMLR Compliance Software for Obliged Entities"
desc = "AMLSync App: client onboarding, identity checks, sanctions and PEP screening, risk assessment and records for EU obliged entities under AMLR (EU) 2024/1624."
s = re.sub(r"<title>.*?</title>", f"<title>{title}</title>", s, flags=re.S)
s = re.sub(r'(<meta name="description" content=")[^"]*', r"\g<1>" + desc, s)
s = re.sub(r'(<meta property="og:title" content=")[^"]*', r"\g<1>" + title, s)
s = re.sub(r'(<meta property="og:description" content=")[^"]*', r"\g<1>" + desc, s)
s = re.sub(r'(<link rel="canonical" href=")[^"]*', r"\g<1>https://amlsync.com/app.html", s)
s = re.sub(r'(<meta property="og:url" content=")[^"]*', r"\g<1>https://amlsync.com/app.html", s)
s = re.sub(r'<script type="application/ld\+json">.*?</script>\n?', "", s, flags=re.S)
s = s.replace(' aria-current="page"', "")
ICON = lambda d: f'<div class="icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">{d}</svg></div>'
APP = "https://app.amlsync.com"
feats = [
  ('<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/><path d="M4 21a8 8 0 0 1 16 0"/>', "Client onboarding portal", "Send one secure link. Your client fills in the questionnaire, uploads documents and confirms ownership — on their phone, in minutes."),
  ('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>', "Identity checks", "National eID or ID document with chip read, liveness and face match. Images, video and the report are saved to the client file."),
  ('<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-4"/>', "Sanctions, PEP and adverse media", "EU and UN sanctions lists included and re-checked whenever they change; ownership chains are added up for the 50% rule."),
  ('<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M7.5 8 11 16M16.5 8 13 16"/>', "Beneficial owners, calculated", "Enter the structure once. AMLSync App finds everyone who owns or controls 25% or more and screens each of them."),
  ('<path d="M3 12h4l2-6 4 12 2-6h6"/>', "Risk assessment and hard gates", "Every client gets a risk score with reasons. A client can't be accepted, and a matter can't complete, while a required step is missing."),
  ('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>', "Compliance calendar", "Refresh dates, reports and deadlines in one place, with automatic reminders to your clients and your team."),
  ('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z"/><path d="M14 3v6h6"/>', "Firm risk assessment and policies", "Your business-wide risk assessment, AML policies and procedures drafted from your answers — reviewed and approved by you."),
  ('<path d="M12 2 4 6v6c0 4.5 3.4 8.3 8 9"/><path d="M15 17l2 2 4-4"/>', "Suspicion reports", "Record internal suspicions, decide and prepare reports to your FIU, with the full audit trail kept."),
  ('<path d="M4 4h16v16H4z"/><path d="M8 8h8v8H8z"/>', "Ready for the supervisor", "A complete, exportable file per client and for your firm: identity, ownership, screening, risk, decisions and training records."),
]
cards = "\n".join(f'      <div class="card">{ICON(d)}<h3>{t}</h3><p>{x}</p></div>' for d, t, x in feats)
main = f'''<main id="main">

<section class="page-hero">
  <img class="hero-orb" src="assets/orb.svg" alt="" aria-hidden="true">
  <div class="container" style="position:relative">
    <span class="eyebrow">New from AMLSync</span>
    <h1>AMLSync App: AMLR compliance, done in one place.</h1>
    <p class="lead">Software for accountants, real estate agents, lawyers, trust and company service providers, high-value goods traders and every other obliged entity under the EU Anti-Money Laundering Regulation (EU) 2024/1624.</p>
    <div class="hero-actions" style="margin-top:28px">
      <a class="btn btn-primary" href="{APP}/signup">Start 14-day free trial</a>
      <a class="btn btn-ghost" href="{APP}/login">Sign in</a>
    </div>
    <p class="hero-points" style="margin-top:20px"><span>EU data hosting</span><span>Built by AML practitioners</span><span>From €49 per month</span></p>
  </div>
</section>

<section>
  <div class="container">
    <div class="section-head">
      <span class="eyebrow">What it does</span>
      <h2>Everything AMLR asks of you, without the spreadsheets.</h2>
      <p>The same standards our analysts apply for regulated financial companies, built into software for firms that need to run compliance themselves.</p>
    </div>
    <div class="grid grid-3">
{cards}
    </div>
  </div>
</section>

<section class="section-dark">
  <div class="container">
    <div class="section-head">
      <span class="eyebrow" style="color:var(--cyan)">How it works</span>
      <h2>From sign-up to your first compliant client in a day.</h2>
    </div>
    <div class="grid grid-4 steps">
      <div class="step"><h3>Set up your firm</h3><p>Choose your country and sector. The app drafts your risk assessment and policies for your review.</p></div>
      <div class="step"><h3>Invite your client</h3><p>The client completes the questionnaire, uploads documents and verifies their identity through a secure link.</p></div>
      <div class="step"><h3>Review and decide</h3><p>Screening, ownership and risk are worked out for you. You approve, and every step is recorded.</p></div>
      <div class="step"><h3>Stay up to date</h3><p>Automatic re-screening, refresh reminders and deadlines keep each file current.</p></div>
    </div>
  </div>
</section>

<section>
  <div class="container">
    <div class="section-head">
      <span class="eyebrow">Pricing</span>
      <h2>Simple monthly plans, billed by invoice.</h2>
      <p>14-day free trial with €15 credit for paid checks. Prices exclude VAT. No card needed.</p>
    </div>
    <div class="grid grid-3">
      <div class="card"><h3>Solo</h3><p style="font-size:2rem;font-weight:800;color:var(--ink);margin:.2em 0">€49<span style="font-size:1rem;font-weight:500;color:var(--ink-soft)"> / month</span></p><ul class="checks"><li>Up to 2 users</li><li>Client portal, risk scoring, audit log</li><li>EU and UN sanctions screening included</li></ul><a class="btn btn-primary btn-sm" href="{APP}/signup?plan=solo" style="margin-top:12px">Start free trial</a></div>
      <div class="card"><h3>Starter</h3><p style="font-size:2rem;font-weight:800;color:var(--ink);margin:.2em 0">€149<span style="font-size:1rem;font-weight:500;color:var(--ink-soft)"> / month</span></p><ul class="checks"><li>Up to 10 users</li><li>Everything in Solo</li><li>Policies, firm risk assessment, training records</li></ul><a class="btn btn-primary btn-sm" href="{APP}/signup?plan=starter" style="margin-top:12px">Start free trial</a></div>
      <div class="card" style="background:var(--navy-900);border-color:var(--navy-900)"><h3 style="color:#fff">Professional / Enterprise</h3><p style="color:rgba(255,255,255,.75)">More users, several offices, higher limits or an API. We'll tailor a plan to your firm.</p><a class="card-link" href="mailto:contact@amlsync.com" style="color:var(--cyan)">contact@amlsync.com →</a></div>
    </div>
    <p style="color:var(--ink-soft);margin-top:20px">Paid checks on all plans: remote identity check €3, PEP / sanctions / adverse-media screening €3 — not charged if a check expires or fails.</p>
  </div>
</section>

<section class="section-soft">
  <div class="container">
    <div class="cta-band">
      <div>
        <h2>Prefer people to software — or both?</h2>
        <p>AMLSync's analysts can work inside AMLSync App for you: onboarding reviews, back-book remediation or an independent check of your files.</p>
      </div>
      <a class="btn btn-primary" href="/#contact">Talk to us</a>
    </div>
  </div>
</section>

</main>'''
s = re.sub(r"<main id=\"main\">.*?</main>", lambda _: main, s, flags=re.S)
(root / "app.html").write_text(s)
print("app.html", len(s))
