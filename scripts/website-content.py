"""Content updates for the AMLSync App launch on Home, Services, About, sitemap and styles."""
import pathlib, sys, json, re
root = pathlib.Path(sys.argv[1])
APP = "https://app.amlsync.com"
def edit(name, pairs):
    p = root / name; s = p.read_text()
    for old, new in pairs:
        if old not in s: raise SystemExit(f"{name}: not found: {old[:80]}")
        s = s.replace(old, new, 1)
    p.write_text(s)

# Home
edit("index.html", [
  ('<div class="hero-copy">\n      <h1>', f'<div class="hero-copy">\n      <a class="hero-new" href="app.html"><span>New</span> AMLSync App — AMLR compliance software for obliged entities →</a>\n      <h1>'),
  ('<meta name="description" content="Experienced AML/KYC analysts and compliance support for payment and e-money institutions, crypto and gaming companies — with flexible commitments.">',
   '<meta name="description" content="Experienced AML/KYC analysts and compliance support for payment and e-money institutions, crypto and gaming companies — and AMLSync App, AMLR compliance software for obliged entities.">'),
  ('<section class="section-dark">\n  <div class="container">\n    <div class="section-head">\n      <span class="eyebrow" style="color:var(--cyan)">How it works</span>',
   f'''<section id="app">
  <div class="container split">
    <div>
      <span class="eyebrow">New · AMLSync App</span>
      <h2>Now also as software you run yourself.</h2>
      <p style="color:var(--ink-soft);font-size:1.08rem">AMLSync is expanding beyond outsourcing. AMLSync App brings the way our analysts work into one place for accountants, real estate agents, lawyers, trust and company service providers, high-value goods traders and other obliged entities under the EU AML Regulation.</p>
      <div class="hero-actions" style="margin-top:20px">
        <a class="btn btn-primary" href="app.html">Discover AMLSync App</a>
        <a class="btn btn-dark" href="{APP}/login">Sign in</a>
      </div>
    </div>
    <ul class="checks" style="margin-top:8px">
      <li><strong style="color:var(--ink)">Client onboarding portal.</strong> One secure link for the questionnaire, documents and identity check.</li>
      <li><strong style="color:var(--ink)">Screening built in.</strong> EU and UN sanctions, PEP and adverse media, re-checked automatically.</li>
      <li><strong style="color:var(--ink)">Risk and ownership worked out.</strong> Beneficial owners calculated, risk scored, nothing accepted with steps missing.</li>
      <li><strong style="color:var(--ink)">Supervisor-ready records.</strong> Policies, risk assessment, training and a complete file per client.</li>
      <li><strong style="color:var(--ink)">From €49 per month.</strong> 14-day free trial, billed monthly by invoice.</li>
    </ul>
  </div>
</section>

<section class="section-dark">
  <div class="container">
    <div class="section-head">
      <span class="eyebrow" style="color:var(--cyan)">How it works</span>'''),
  ('<option>Not sure yet</option>', '<option>AMLSync App (software)</option>\n            <option>Not sure yet</option>'),
  ('''          "name": "Remediation sprint"
        }
      }
    ]''', '''          "name": "Remediation sprint"
        }
      },
      {
        "@type": "Offer",
        "itemOffered": {
          "@type": "SoftwareApplication",
          "name": "AMLSync App",
          "applicationCategory": "BusinessApplication",
          "url": "https://amlsync.com/app.html"
        }
      }
    ]'''),
])

# Services: hero line + a software entry before the first service
edit("services.html", [
  ('<p class="lead">From one part-time analyst to a small dedicated team — each engagement is defined up front, regularly reported and cleanly handed over.</p>',
   '<p class="lead">From one part-time analyst to a small dedicated team — each engagement is defined up front, regularly reported and cleanly handed over. And now AMLSync App, for firms that run compliance themselves.</p>'),
  ('      <div class="service" id="remediation">', f'''      <div class="service" id="remediation">'''),
])
p = root / "services.html"; s = p.read_text()
marker = '  </div>\n</section>\n\n<div class="container">\n  <img class="photo photo-banner"'
if marker not in s: raise SystemExit("services: section end not found")
app_block = f'''    
      <div class="service" id="app">
        <div><span class="tag">Software · New</span><h2>AMLSync App</h2></div>
        <div>
          <p class="intro">AMLR compliance software for obliged entities — accountants, real estate agents, lawyers, trust and company service providers, high-value goods traders and more. Our analysts can also work inside it for you.</p>
          <div class="service-meta">
            <div><h4>What's included</h4><ul class="checks"><li>Client onboarding portal with identity checks</li><li>Sanctions, PEP and adverse-media screening</li><li>Beneficial ownership and risk scoring</li><li>Firm risk assessment, policies and training records</li><li>Compliance calendar and supervisor-ready exports</li></ul></div>
            <div><h4>Good to know</h4><ul class="checks"><li>From €49 per month, billed by invoice</li><li>14-day free trial</li><li>Data hosted in the EU</li><li><a href="app.html">See AMLSync App</a> · <a href="{APP}/login">Sign in</a></li></ul></div>
          </div>
        </div>
      </div>
'''
s = s.replace(marker, app_block + marker, 1); p.write_text(s)

# About: the expansion
edit("about.html", [
  ('<p>AMLSync exists to close that gap — with experienced people who can start quickly, work inside your procedures, and leave your compliance function stronger when they hand over.</p>',
   '<p>AMLSync exists to close that gap — with experienced people who can start quickly, work inside your procedures, and leave your compliance function stronger when they hand over.</p>\n      <p>Now AMLSync is expanding with <a href="app.html">AMLSync App</a>: the same practitioner standards, built into software for accountants, real estate agents, lawyers and the many other businesses the EU AML Regulation brings into scope. Use it on its own, or with our analysts working inside it for you.</p>'),
])

# Sitemap
edit("sitemap.xml", [('  <url><loc>https://amlsync.com/about.html</loc>', '  <url><loc>https://amlsync.com/app.html</loc><lastmod>2026-11-18</lastmod></url>\n  <url><loc>https://amlsync.com/about.html</loc>')])

# Styles
p = root / "assets/styles.css"; s = p.read_text()
s += '''
/* AMLSync App launch */
.nav-links a.nav-signin { color: #fff; font-weight: 600; }
.hero-new { display: inline-flex; align-items: center; gap: 10px; margin-bottom: 22px; padding: 6px 14px 6px 6px; border-radius: 999px; background: rgba(67,198,232,.12); border: 1px solid rgba(67,198,232,.35); color: #fff; font-size: .92rem; font-weight: 500; }
.hero-new:hover { text-decoration: none; background: rgba(67,198,232,.2); }
.hero-new span { background: var(--cyan); color: var(--navy-950); font-weight: 700; font-size: .75rem; letter-spacing: .06em; text-transform: uppercase; padding: 3px 10px; border-radius: 999px; }
'''
p.write_text(s)
print("content updated")
