/**
 * Branded HTML for every email (the plain text stays as the text part).
 * Email clients ignore stylesheets, so styles are inline; tables for layout.
 * Lines that are only a URL become a button; other URLs become links.
 */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const NAVY = "#050f22", CYAN = "#43c6e8", INK = "#0f172a", MUTED = "#475569";

function linkify(line: string): string {
  return esc(line).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" style="color:#0b6e8f;text-decoration:underline">${u}</a>`);
}

export function buttonLabel(url: string): string {
  if (/\/p\/|portal/.test(url)) return "Open your secure link";
  if (/\/reset|\/recover/.test(url)) return "Reset your password";
  if (/\/invite|\/accept/.test(url)) return "Accept the invitation";
  if (/\/verify|\/confirm|\/signup/.test(url)) return "Confirm your email";
  return "Open AMLSync App";
}

export function renderEmailHtml(subject: string, text: string): string {
  const blocks = text.trim().split(/\n{2,}/);
  const body = blocks.map((b) => {
    const t = b.trim();
    if (/^https?:\/\/\S+$/.test(t)) {
      return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 16px"><tr><td style="border-radius:999px;background:${CYAN}"><a href="${esc(t)}" style="display:inline-block;padding:12px 22px;font-weight:700;color:${NAVY};text-decoration:none;border-radius:999px">${buttonLabel(t)}</a></td></tr></table><p style="margin:0 0 16px;font-size:12px;color:${MUTED};word-break:break-all">Or paste this link into your browser: ${linkify(t)}</p>`;
    }
    const lines = t.split("\n");
    // A line ending in ":" followed by a URL line: button for the URL.
    const last = lines[lines.length - 1].trim();
    if (lines.length > 1 && /^https?:\/\/\S+$/.test(last)) {
      return `<p style="margin:0 0 12px">${lines.slice(0, -1).map(linkify).join("<br>")}</p>` + renderEmailHtml.__button(last);
    }
    return `<p style="margin:0 0 16px">${lines.map(linkify).join("<br>")}</p>`;
  }).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;font-family:Inter,Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.55;color:${INK}">
<tr><td style="background:${NAVY};padding:20px 28px">
<div style="font-family:Manrope,Segoe UI,Arial,sans-serif;font-weight:800;font-size:22px;letter-spacing:.5px;color:#ffffff">AML<span style="color:${CYAN}">SYNC</span></div>
<div style="font-size:10px;letter-spacing:2.5px;color:rgba(255,255,255,.7);text-transform:uppercase">Compliance Services</div>
</td></tr>
<tr><td style="padding:28px">${body}</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #e2e8f0;font-size:12px;color:${MUTED}">AMLSync App · Integral Services, MB · Vilnius, Lithuania · <a href="mailto:contact@amlsync.com" style="color:${MUTED}">contact@amlsync.com</a><br>You get this email because of your account or a request from a firm that uses AMLSync App.</td></tr>
</table></td></tr></table></body></html>`;
}
renderEmailHtml.__button = (url: string) => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 16px"><tr><td style="border-radius:999px;background:${CYAN}"><a href="${esc(url)}" style="display:inline-block;padding:12px 22px;font-weight:700;color:${NAVY};text-decoration:none;border-radius:999px">${buttonLabel(url)}</a></td></tr></table>`;
