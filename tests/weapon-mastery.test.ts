import { describe, it, expect } from "vitest";
import { MASTERY, masteryDerived, masteryLabel } from "../src/weapon/weapon-mastery";

const SLUGS = ["cleave", "graze", "nick", "push", "sap", "slow", "topple", "vex"];

describe("weapon mastery glossary", () => {
  it("has all 8 masteries with non-empty label + description", () => {
    for (const s of SLUGS) {
      expect(MASTERY[s]?.label, s).toBeTruthy();
      expect(MASTERY[s]?.description?.length, s).toBeGreaterThan(20);
    }
    expect(Object.keys(MASTERY).sort()).toEqual([...SLUGS].sort());
  });

  it("derives a number ONLY for topple and graze", () => {
    expect(masteryDerived("topple", 3, 2)).toEqual({ label: "Save DC", value: 13 }); // 8+2+3
    expect(masteryDerived("graze", 3, 2)).toEqual({ label: "On miss", value: 3 });
    for (const s of ["cleave", "nick", "push", "sap", "slow", "vex"]) {
      expect(masteryDerived(s, 3, 2), s).toBeUndefined();
    }
  });

  it("is resilient to an unknown slug", () => {
    expect(masteryDerived("bogus", 3, 2)).toBeUndefined();
    expect(masteryLabel("bogus")).toBeUndefined();
    expect(masteryLabel("vex")).toBe("Vex");
  });
});
