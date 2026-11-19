import { describe, expect, it } from "vitest";
import { channelOf, classifyUa, cleanPath, referrerHost } from "./web";
import { inAudience, isAllFirms, leadScore, parseVies, slaDue, splitVatId, ticketPriority } from "./ops";

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

describe("web analytics helpers", () => {
  it("classifies browsers, devices and bots", () => {
    expect(classifyUa(CHROME)).toEqual({ device: "desktop", browser: "Chrome", bot: null });
    expect(classifyUa(IPHONE)).toMatchObject({ device: "mobile", browser: "Safari", bot: null });
    expect(classifyUa("Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)").bot).toBe("ai:OpenAI");
    expect(classifyUa("Mozilla/5.0 (compatible; Googlebot/2.1)").bot).toBe("search:Google");
    expect(classifyUa("Mozilla/5.0 HeadlessChrome/120").bot).toBe("automation");
    expect(classifyUa("").bot).toBe("automation");
  });
  it("keeps referrer hosts and clean paths only", () => {
    expect(referrerHost("https://www.google.com/search?q=aml")).toBe("google.com");
    expect(referrerHost("https://amlsync.com/about.html")).toBeNull();
    expect(referrerHost("not a url")).toBeNull();
    expect(cleanPath("/app.html?email=a@b.lt#x")).toBe("/app.html");
    expect(cleanPath("insights.html")).toBe("/insights.html");
  });
  it("assigns channels", () => {
    expect(channelOf(null)).toBe("Direct");
    expect(channelOf("chatgpt.com")).toBe("AI: ChatGPT");
    expect(channelOf("google.lt")).toBe("Search");
    expect(channelOf("linkedin.com")).toBe("Social");
    expect(channelOf("lapas.lt")).toBe("Referral");
    expect(channelOf("google.com", "newsletter")).toBe("Email");
  });
});

describe("leads", () => {
  const now = new Date("2026-11-18T12:00:00Z");
  it("scores fit and intent", () => {
    const hot = leadScore({ email: "jonas@apskaita.lt", company: "Apskaita UAB", country: "LT", need: "AMLSync App (software)", message: "x".repeat(200), source: "website-form", stage: "new", pageviews: 6, createdAt: now }, now);
    expect(hot.score).toBe(90);
    const cold = leadScore({ email: "x@gmail.com", source: "manual", stage: "new", createdAt: new Date("2026-01-01") }, now);
    expect(cold.score).toBe(0);
    expect(leadScore({ email: "a@b.lt", source: "website-form", stage: "lost", createdAt: now }, now).score).toBe(0);
  });
});

describe("tickets", () => {
  it("sets priorities and SLA targets", () => {
    expect(ticketPriority("billing", true)).toBe("P1");
    expect(ticketPriority("technical", false)).toBe("P2");
    expect(ticketPriority("advisory", false)).toBe("P3");
    const fri = new Date("2026-11-20T15:00:00Z");
    expect(slaDue("P1", fri).toISOString()).toBe("2026-11-20T16:00:00.000Z");
    expect(slaDue("P3", fri).toISOString()).toBe("2026-11-23T15:00:00.000Z");
  });
});

describe("VIES", () => {
  it("splits VAT IDs", () => {
    expect(splitVatId("LT 100017008718")).toEqual({ cc: "LT", number: "100017008718" });
    expect(splitVatId("GR123456789")).toEqual({ cc: "EL", number: "123456789" });
    expect(splitVatId("US123")).toBeNull();
    expect(splitVatId("nonsense")).toBeNull();
  });
  it("parses responses", () => {
    expect(parseVies({ isValid: true, name: "INTEGRAL SERVICES, MB", userError: "VALID" })).toEqual({ status: "valid", name: "INTEGRAL SERVICES, MB" });
    expect(parseVies({ isValid: false, name: "---", userError: "INVALID" })).toEqual({ status: "invalid", name: null });
    expect(parseVies({ isValid: false, userError: "MS_UNAVAILABLE" }).status).toBe("unavailable");
    expect(parseVies(null).status).toBe("unavailable");
  });
});

describe("announcements", () => {
  const f = { homeState: "LT", plan: "starter", status: "active", sectors: ["ACCOUNTANT"] };
  it("matches segments", () => {
    expect(inAudience({}, f)).toBe(true);
    expect(isAllFirms({})).toBe(true);
    expect(inAudience({ country: "lt", sector: "ACCOUNTANT" }, f)).toBe(true);
    expect(inAudience({ plan: "solo" }, f)).toBe(false);
    expect(isAllFirms({ country: "LT" })).toBe(false);
  });
});
