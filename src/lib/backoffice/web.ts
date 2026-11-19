/**
 * Cookieless audience measurement helpers (§7.5–7.6). No IP is stored: the
 * visitor id is a hash of IP + user agent + a salt that changes every day, so
 * visits can't be linked across days or to a person.
 */
export interface UaInfo { device: "desktop" | "mobile" | "tablet"; browser: string; bot: string | null }

const AI_CRAWLERS: [RegExp, string][] = [
  [/GPTBot|ChatGPT-User|OAI-SearchBot/i, "OpenAI"], [/ClaudeBot|Claude-User|Claude-SearchBot|anthropic-ai/i, "Anthropic"],
  [/PerplexityBot|Perplexity-User/i, "Perplexity"], [/CCBot/i, "Common Crawl"], [/Bytespider/i, "ByteDance"],
  [/Amazonbot/i, "Amazon"], [/Applebot/i, "Apple"], [/meta-externalagent/i, "Meta"],
];
const GOOD_BOTS: [RegExp, string][] = [[/Googlebot|Google-InspectionTool/i, "Google"], [/bingbot/i, "Bing"], [/DuckDuckBot/i, "DuckDuckGo"], [/YandexBot/i, "Yandex"]];
const SEO_BOTS: [RegExp, string][] = [[/AhrefsBot/i, "Ahrefs"], [/SemrushBot/i, "Semrush"], [/MJ12bot/i, "Majestic"]];

export function classifyUa(ua: string): UaInfo {
  const bot =
    AI_CRAWLERS.find(([r]) => r.test(ua))?.[1].replace(/^/, "ai:") ??
    GOOD_BOTS.find(([r]) => r.test(ua))?.[1].replace(/^/, "search:") ??
    SEO_BOTS.find(([r]) => r.test(ua))?.[1].replace(/^/, "seo:") ??
    (/HeadlessChrome|PhantomJS|Puppeteer|Playwright|python-requests|curl\/|wget|Go-http-client|\bbot\b|crawler|spider/i.test(ua) || !ua ? "automation" : null);
  const device = /iPad|Tablet/i.test(ua) ? "tablet" : /Mobi|Android|iPhone/i.test(ua) ? "mobile" : "desktop";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Other";
  return { device, browser, bot };
}

/** Referrer host, without www; null for own sites and empty referrers. */
export function referrerHost(ref: string | null | undefined, own: string[] = ["amlsync.com", "app.amlsync.com"]): string | null {
  if (!ref) return null;
  try {
    const h = new URL(ref).hostname.toLowerCase().replace(/^www\./, "");
    return own.includes(h) ? null : h.slice(0, 100);
  } catch { return null; }
}

const AI_REFERRERS: [RegExp, string][] = [[/chatgpt\.com|chat\.openai\.com/, "ChatGPT"], [/perplexity\.ai/, "Perplexity"], [/claude\.ai/, "Claude"], [/copilot\.microsoft\.com|bing\.com\/chat/, "Copilot"], [/gemini\.google\.com/, "Gemini"]];
const SEARCH = /(^|\.)(google|bing|duckduckgo|yahoo|ecosia|yandex|qwant)\./;
const SOCIAL = /(^|\.)(linkedin|lnkd|facebook|instagram|x|twitter|t|reddit|youtube)\.(com|co|in)$/;

export function channelOf(host: string | null, utmMedium?: string | null): string {
  if (utmMedium) return /cpc|paid|ads/i.test(utmMedium) ? "Paid" : /email|newsletter/i.test(utmMedium) ? "Email" : "Campaign";
  if (!host) return "Direct";
  const ai = AI_REFERRERS.find(([r]) => r.test(host));
  if (ai) return `AI: ${ai[1]}`;
  if (SEARCH.test(host)) return "Search";
  if (SOCIAL.test(host)) return "Social";
  return "Referral";
}

/** Path only, no query (queries can hold personal data), at most 200 chars. */
export function cleanPath(p: string): string {
  const path = (p || "/").split(/[?#]/)[0].replace(/\/{2,}/g, "/").slice(0, 200);
  return path.startsWith("/") ? path : `/${path}`;
}
