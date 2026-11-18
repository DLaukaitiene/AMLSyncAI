"""One-off edit of the amlsync.com static site: AMLSync App launch (logo, nav, new page, copy)."""
import re, pathlib, sys
root = pathlib.Path(sys.argv[1])
APP = "https://app.amlsync.com"
pages = sorted(p for p in root.glob("*.html"))

def nav_block(current: str) -> str:
    items = [("/", "Home"), ("services.html", "Services"), ("app.html", "AMLSync App"), ("about.html", "About"), ("insights.html", "Insights")]
    lis = "".join(f'<li><a href="{h}"{" aria-current=\"page\"" if h == current else ""}>{t}</a></li>' for h, t in items)
    return (f'<ul class="nav-links" id="nav-links">\n      {lis}\n'
            f'      <li><a class="nav-signin" href="{APP}/login">Sign in</a></li>\n'
            f'      <li><a class="btn btn-primary btn-sm" href="/#contact">Get in touch</a></li>\n    </ul>')

for p in pages + [root / "app.html"] if (root / "app.html").exists() else pages:
    s = p.read_text()
    # Logo: AMLSYNC with "Compliance Services" underneath (header and footer)
    s = s.replace("<b>AML<span>Sync</span></b><small>Compliance outsourcing</small>", "<b>AML<span>SYNC</span></b><small>Compliance Services</small>")
    # Header navigation
    m = re.search(r'<ul class="nav-links" id="nav-links">.*?</ul>', s, re.S)
    if m:
        cur = re.search(r'<a href="([^"]+)" aria-current="page">', m.group(0))
        current = cur.group(1) if cur else ("app.html" if p.name == "app.html" else "")
        if p.name.startswith("insights") and not current: current = "insights.html"
        s = s[:m.start()] + nav_block(current) + s[m.end():]
    # Footer pages list
    s = s.replace('<li><a href="services.html">Services</a></li>\n          <li><a href="about.html">About</a></li>',
                  f'<li><a href="services.html">Services</a></li>\n          <li><a href="app.html">AMLSync App</a></li>\n          <li><a href="{APP}/login">Sign in to AMLSync App</a></li>\n          <li><a href="about.html">About</a></li>')
    p.write_text(s)
print("pages:", len(pages))
