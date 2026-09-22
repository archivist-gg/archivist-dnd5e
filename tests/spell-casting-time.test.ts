import { describe, it, expect } from "vitest";
import { parseCastingTime } from "../src/spell/casting-time";
import { castTimeCategory } from "../src/spell/spell.filter";

// One parser for every casting-time reader. Before it, the Cast table's label and the add-drawer's filter
// each kept an exact-string switch over the bundle's spellings (`action`, `bonus-action`, `1minute`), so any
// other spelling fell through: a converted or AI-generated spell's `1 action` and `10 minute` printed raw
// in the Cast table, and 120-odd vault spells spelled `bonus action` / `1 minute` / `1 hour` filtered as
// "special". The LEADING token decides; prose after it (a reaction's trigger, "or 8 hours") is kept for the
// tooltip, never matched.
describe("parseCastingTime", () => {
  it("reads the action economy with or without a count, in any spacing or case", () => {
    for (const t of ["action", "Action", "1 action", "1action", "1 Action, which you take …", "1 action or 8 hours"])
      expect(parseCastingTime(t), t).toEqual({ kind: "action", count: 1 });
    for (const t of ["bonus action", "bonus-action", "Bonus Action", "1 bonus action", "bonus", "1 bonus", "1bonus"])
      expect(parseCastingTime(t), t).toEqual({ kind: "bonus", count: 1 });
    for (const t of ["reaction", " reaction ", "1 reaction", "reaction (which you take when you fall)"])
      expect(parseCastingTime(t), t).toEqual({ kind: "reaction", count: 1 });
  });

  it("reads minutes and hours with an optional count, singular or plural, spaced or joined", () => {
    expect(parseCastingTime("minute")).toEqual({ kind: "time", count: 1, unit: "minute" });
    expect(parseCastingTime("1minute")).toEqual({ kind: "time", count: 1, unit: "minute" });
    expect(parseCastingTime("1 minute")).toEqual({ kind: "time", count: 1, unit: "minute" });
    expect(parseCastingTime("10 minute")).toEqual({ kind: "time", count: 10, unit: "minute" });
    expect(parseCastingTime("10minutes")).toEqual({ kind: "time", count: 10, unit: "minute" });
    expect(parseCastingTime("10 Minutes")).toEqual({ kind: "time", count: 10, unit: "minute" });
    expect(parseCastingTime("1 min")).toEqual({ kind: "time", count: 1, unit: "minute" });
    expect(parseCastingTime("hour")).toEqual({ kind: "time", count: 1, unit: "hour" });
    expect(parseCastingTime("1 hour")).toEqual({ kind: "time", count: 1, unit: "hour" });
    expect(parseCastingTime("8hours")).toEqual({ kind: "time", count: 8, unit: "hour" });
    expect(parseCastingTime("24 hours")).toEqual({ kind: "time", count: 24, unit: "hour" });
    expect(parseCastingTime("12 hr")).toEqual({ kind: "time", count: 12, unit: "hour" });
  });

  it("returns null for anything it cannot read, and never matches a word that merely STARTS with a unit", () => {
    for (const t of [undefined, "", "   ", "weird", "1 week", "reactionary", "bonuses", "actions", "minuteman", "hourly"])
      expect(parseCastingTime(t), String(t)).toBeNull();
  });
});

describe("castTimeCategory reads through the same parser", () => {
  it("files the spaced, capitalised and counted spellings in their real bucket, not special", () => {
    expect(castTimeCategory("1 action")).toBe("action");
    expect(castTimeCategory("bonus action")).toBe("bonus");
    expect(castTimeCategory("1 bonus")).toBe("bonus");
    expect(castTimeCategory("Reaction (which you take when you are hit)")).toBe("reaction");
    expect(castTimeCategory("1 minute")).toBe("long");
    expect(castTimeCategory("10 minute")).toBe("long");
    expect(castTimeCategory("1 hour")).toBe("long");
    expect(castTimeCategory("24 hours")).toBe("long");
    expect(castTimeCategory("1 week")).toBe("special");
  });
});
