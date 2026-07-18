import { describe, it, expect } from "vitest";
import { MASTERY, masteryDerived, masteryLabel, masteryGist } from "../src/weapon/weapon-mastery";

const SLUGS = ["cleave", "graze", "nick", "push", "sap", "slow", "topple", "vex"];

// Verbatim effect gists (NO em dashes): one-line summaries surfaced in the
// Actions-tab mastery column so the reader doesn't need the full glossary prose.
const GISTS: Record<string, string> = {
  topple: "on fail: Prone",
  push: "on hit: pushed 10 ft",
  sap: "on hit: target Disadvantage",
  slow: "on hit: -10 ft Speed",
  vex: "on hit: you gain Advantage next",
  graze: "on miss: ability-mod damage",
  nick: "extra Light attack (no Bonus Action)",
  cleave: "hit a 2nd creature in reach",
};

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

  it("carries the verbatim effect gist for all 8 masteries", () => {
    for (const s of SLUGS) {
      expect(MASTERY[s]?.gist, s).toBe(GISTS[s]);
    }
  });

  it("contains no em dash in any gist", () => {
    for (const s of SLUGS) {
      expect(MASTERY[s]?.gist?.includes("—"), s).toBe(false);
    }
  });

  it("masteryGist(slug) returns the gist, or undefined for an unknown slug", () => {
    expect(masteryGist("topple")).toBe("on fail: Prone");
    expect(masteryGist("sap")).toBe("on hit: target Disadvantage");
    expect(masteryGist("bogus")).toBeUndefined();
  });
});
