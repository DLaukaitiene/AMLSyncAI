import { describe, expect, it } from "vitest";
import { moduleFromPath, similarRequests, spamReason, statusChangeProblem, titleSimilarity } from "./rules";

describe("feature requests (§11.13)", () => {
  const existing = [
    { title: "Export the compliance calendar to Outlook" },
    { title: "CSV export of client list" },
    { title: "Lithuanian translation of the client portal" },
    { title: "Bulk send portal links" },
    { title: "Calendar export as ICS" },
    { title: "Exporting the calendar to Google" },
  ];
  it("shows similar requests while typing (up to 5)", () => {
    const s = similarRequests("Calendar export", existing).map((x) => x.title);
    expect(s).toEqual(expect.arrayContaining(["Export the compliance calendar to Outlook", "Calendar export as ICS", "Exporting the calendar to Google"]));
    expect(s).not.toContain("Bulk send portal links");
    expect(titleSimilarity("client portal in Lithuanian", "Lithuanian translation of the client portal")).toBeGreaterThan(0.5);
  });
  it("filters spam and profanity", () => {
    expect(spamReason("This shit doesn't work")).not.toBeNull();
    expect(spamReason("see https://a https://b https://c")).not.toBeNull();
    expect(spamReason("Please add ICS export of the calendar")).toBeNull();
  });
  it("needs a reason for Not planned and a link for Released", () => {
    expect(statusChangeProblem("NOT_PLANNED")).toMatch(/reason/);
    expect(statusChangeProblem("RELEASED", undefined, "")).toMatch(/release-note/);
    expect(statusChangeProblem("RELEASED", undefined, "https://amlsyncai.eu/releases/1.2")).toBeNull();
    expect(statusChangeProblem("PLANNED")).toBeNull();
  });
  it("pre-fills the module from the screen", () => {
    expect(moduleFromPath("/app/clients/123")).toBe("Clients and CDD");
    expect(moduleFromPath("/app/firm/policies")).toBe("Policy Builder");
  });
});
