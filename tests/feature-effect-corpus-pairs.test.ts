import { describe, it, expect } from "vitest";
import { featureEffectSchema } from "../src/schemas/feature-effect-schema";
import fixture from "./fixtures/feature-effect-corpus-pairs.json";

// Spec R4-G1a G2. The fixture is GENERATED ONCE over the converter's six roots (see its header) and checked in:
// refreshing it is a reviewable diff, never a live read of the gitignored converter output.
describe("featureEffectSchema · every emitted (kind, key-set) pair parses output-equal (G2)", () => {
  it("pins the corpus shape: 21 kinds, 72 pairs, 1853 sites", () => {
    expect(fixture.kinds).toBe(21);
    expect(fixture.rows).toHaveLength(72);
    expect(fixture.pairs).toBe(72);
    expect(fixture.sites).toBe(1853);
    expect(fixture.perKind).toEqual({
      "ability-score-increase": 1, "ac-bonus": 5, "apply-condition": 5, "crit-range": 3, "damage-bonus": 8,
      "extra-action": 2, "extra-attack": 2, "heal": 3, "hp-per-level-bonus": 2, "immune-condition": 3, "immunity": 3,
      "proficiency": 5, "resistance": 3, "roll-modifier": 7, "save-outcome": 1, "sense": 3, "speed-bonus": 6,
      "temp-hp": 3, "unarmored-ac": 3, "vulnerability": 1, "weapon-ability": 3,
    });
  });
  for (const row of fixture.rows) {
    it(`${row.kind} | ${row.keys.join(",")} (${row.sites} sites)`, () => {
      const parsed = featureEffectSchema.parse(row.sample);
      expect(parsed).toEqual(row.sample);
    });
  }
});
