import { describe, expect, it } from "vitest";
import { buttonLabel, renderEmailHtml } from "./template";

describe("branded email", () => {
  it("wraps text in the AMLSYNC layout, escapes HTML, turns URL lines into buttons", () => {
    const h = renderEmailHtml("Your link", "Hello <b>Ona</b>,\n\nPlease complete your details:\nhttps://app.amlsync.com/p/abc\n\nThanks");
    expect(h).toContain("AML<span");
    expect(h).toContain("Compliance Services");
    expect(h).toContain("Hello &lt;b&gt;Ona&lt;/b&gt;");
    expect(h).toContain(">Open your secure link</a>");
    expect(h).toContain('href="https://app.amlsync.com/p/abc"');
  });
  it("labels buttons by link type", () => {
    expect(buttonLabel("https://app.amlsync.com/app/cases")).toBe("Open AMLSync App");
    expect(buttonLabel("https://app.amlsync.com/reset?t=1")).toBe("Reset your password");
  });
});
