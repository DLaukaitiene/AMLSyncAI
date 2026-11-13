import { describe, expect, it } from "vitest";
import { calculateBeneficialOwnership, validateSmoFallback, type OwnershipParty } from "./beneficial-ownership";
import { assessSanctionsOwnership } from "./sanctions-ownership";

const P = (id: string, kind: OwnershipParty["kind"] = "natural"): OwnershipParty => ({ id, kind, name: id });

describe("beneficial ownership (§11.6)", () => {
  it("calculation test: A 60% of X, X 50% of client, A 10% direct → A owns 40% and is a BO", () => {
    const r = calculateBeneficialOwnership(
      "C",
      [P("C", "legal"), P("X", "legal"), P("A")],
      [
        { ownerId: "A", ownedId: "X", pct: 60 },
        { ownerId: "X", ownedId: "C", pct: 50 },
        { ownerId: "A", ownedId: "C", pct: 10 },
      ],
    );
    const a = r.candidates.find((c) => c.personId === "A")!;
    expect(a.effectivePct).toBe(40);
    expect(a.isBeneficialOwner).toBe(true);
    expect(a.chains).toHaveLength(2);
    expect(r.requiresSmoFallback).toBe(false);
  });

  it("threshold test: exactly 25.00% is flagged, 24.99% is not", () => {
    const r = calculateBeneficialOwnership(
      "C",
      [P("C", "legal"), P("A"), P("B")],
      [
        { ownerId: "A", ownedId: "C", pct: 25 },
        { ownerId: "B", ownedId: "C", pct: 24.99 },
      ],
    );
    expect(r.candidates.find((c) => c.personId === "A")!.isBeneficialOwner).toBe(true);
    expect(r.candidates.find((c) => c.personId === "B")!.isBeneficialOwner).toBe(false);
  });

  it("25% reached through float-prone chains is still flagged", () => {
    const r = calculateBeneficialOwnership(
      "C",
      [P("C", "legal"), P("X", "legal"), P("A")],
      [
        { ownerId: "A", ownedId: "X", pct: 50 },
        { ownerId: "X", ownedId: "C", pct: 30 },
        { ownerId: "A", ownedId: "C", pct: 10 },
      ],
    );
    expect(r.beneficialOwners.map((b) => b.personId)).toEqual(["A"]);
    expect(r.beneficialOwners[0].effectivePct).toBe(25);
  });

  it("control by other means makes a person a BO regardless of %", () => {
    const r = calculateBeneficialOwnership(
      "C",
      [P("C", "legal"), P("A"), P("D")],
      [{ ownerId: "A", ownedId: "C", pct: 5 }],
      [{ personId: "D", entityId: "C", type: "board-appointment", description: "Can appoint the majority of the board" }],
    );
    expect(r.beneficialOwners.map((b) => b.personId)).toEqual(["D"]);
  });

  it("no BO → SMO fallback required and validated", () => {
    const r = calculateBeneficialOwnership(
      "C",
      [P("C", "legal"), P("A"), P("B"), P("D"), P("E"), P("F")],
      ["A", "B", "D", "E", "F"].map((id) => ({ ownerId: id, ownedId: "C", pct: 20 })),
    );
    expect(r.requiresSmoFallback).toBe(true);
    expect(validateSmoFallback({ seniorManagingOfficials: [], stepsTaken: "" })).toHaveLength(2);
    expect(
      validateSmoFallback({
        seniorManagingOfficials: [{ personId: "M", name: "M", position: "CEO" }],
        stepsTaken: "Checked JANGIS extract and shareholder register; no holder ≥ 25%.",
      }),
    ).toEqual([]);
  });

  it("resolves a 3-level structure and reports unresolved corporate owners", () => {
    const r = calculateBeneficialOwnership(
      "C",
      [P("C", "legal"), P("L1", "legal"), P("L2", "legal"), P("L3", "legal"), P("Z", "legal"), P("A")],
      [
        { ownerId: "L1", ownedId: "C", pct: 100 },
        { ownerId: "L2", ownedId: "L1", pct: 80 },
        { ownerId: "Z", ownedId: "L1", pct: 20 },
        { ownerId: "L3", ownedId: "L2", pct: 100 },
        { ownerId: "A", ownedId: "L3", pct: 100 },
      ],
    );
    expect(r.beneficialOwners[0]).toMatchObject({ personId: "A", effectivePct: 80 });
    expect(r.unresolvedOwners).toEqual(["Z"]);
  });

  it("survives cross-holding cycles and flags over-allocation", () => {
    const r = calculateBeneficialOwnership(
      "C",
      [P("C", "legal"), P("X", "legal"), P("A")],
      [
        { ownerId: "X", ownedId: "C", pct: 60 },
        { ownerId: "C", ownedId: "X", pct: 30 },
        { ownerId: "A", ownedId: "X", pct: 70 },
        { ownerId: "A", ownedId: "C", pct: 50 },
      ],
    );
    expect(r.candidates[0]).toMatchObject({ personId: "A", effectivePct: 92 });
    expect(r.overAllocated).toEqual([{ entityId: "C", totalPct: 110 }]);
  });
});

describe("sanctions ownership aggregation (§11.8)", () => {
  it("two sanctioned persons owning 30% each → company flagged as > 50% owned", () => {
    const r = assessSanctionsOwnership(
      "C",
      [P("C", "legal"), P("S1"), P("S2"), P("A")],
      [
        { ownerId: "S1", ownedId: "C", pct: 30 },
        { ownerId: "S2", ownedId: "C", pct: 30 },
        { ownerId: "A", ownedId: "C", pct: 40 },
      ],
      new Set(["S1", "S2"]),
    );
    expect(r.affected).toBe(true);
    expect(r.sanctionedOwnershipPct).toBe(60);
  });

  it("exactly 50% is not > 50%", () => {
    const r = assessSanctionsOwnership(
      "C",
      [P("C", "legal"), P("S1"), P("A")],
      [
        { ownerId: "S1", ownedId: "C", pct: 50 },
        { ownerId: "A", ownedId: "C", pct: 50 },
      ],
      new Set(["S1"]),
    );
    expect(r.affected).toBe(false);
  });

  it("propagates through an intermediate entity that is majority-owned by sanctioned persons", () => {
    const r = assessSanctionsOwnership(
      "C",
      [P("C", "legal"), P("H", "legal"), P("S1"), P("A")],
      [
        { ownerId: "S1", ownedId: "H", pct: 51 },
        { ownerId: "A", ownedId: "H", pct: 49 },
        { ownerId: "H", ownedId: "C", pct: 60 },
        { ownerId: "A", ownedId: "C", pct: 40 },
      ],
      new Set(["S1"]),
    );
    expect(r.affected).toBe(true);
    expect(r.contributors).toEqual([{ ownerId: "H", pct: 60, countedPct: 60, why: "affected" }]);
  });

  it("adds sanctioned stakes through chains: 40% of a 50% holder (20%) + 40% direct = 60%", () => {
    const r = assessSanctionsOwnership(
      "C",
      [P("C", "legal"), P("X", "legal"), P("A"), P("B"), P("S2")],
      [
        { ownerId: "A", ownedId: "X", pct: 60 },
        { ownerId: "B", ownedId: "X", pct: 40 },
        { ownerId: "X", ownedId: "C", pct: 50 },
        { ownerId: "S2", ownedId: "C", pct: 40 },
        { ownerId: "A", ownedId: "C", pct: 10 },
      ],
      new Set(["B", "S2"]),
    );
    expect(r.sanctionedOwnershipPct).toBe(60);
    expect(r.affected).toBe(true);
    expect(r.contributors).toContainEqual({ ownerId: "X", pct: 50, countedPct: 20, why: "partly-sanctioned-owned" });
  });

  it("chain sum below 50% is not flagged", () => {
    const r = assessSanctionsOwnership(
      "C",
      [P("C", "legal"), P("X", "legal"), P("S1"), P("A")],
      [
        { ownerId: "S1", ownedId: "X", pct: 40 },
        { ownerId: "A", ownedId: "X", pct: 60 },
        { ownerId: "X", ownedId: "C", pct: 100 },
      ],
      new Set(["S1"]),
    );
    expect(r.sanctionedOwnershipPct).toBe(40);
    expect(r.affected).toBe(false);
  });

  it("flags control by a sanctioned person", () => {
    const r = assessSanctionsOwnership("C", [P("C", "legal"), P("S1")], [], new Set(["S1"]), [
      { personId: "S1", entityId: "C", type: "agreement", description: "Shareholder agreement gives veto" },
    ]);
    expect(r.affected).toBe(true);
    expect(r.controlledBySanctioned).toBe(true);
  });
});
