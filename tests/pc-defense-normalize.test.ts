import { describe, it, expect } from "vitest";
import { toDefenseSlug } from "../src/pc/pc.defense-normalize";
import { DAMAGE_TYPES, DAMAGE_NONMAGICAL_VARIANTS } from "../src/dnd/constants";
import { CONDITION_SLUGS } from "../src/pc/conditions.constants";

describe("toDefenseSlug", () => {
  it("lowercases, trims, and collapses internal whitespace", () => {
    expect(toDefenseSlug("  Psychic  ")).toBe("psychic");
    expect(toDefenseSlug("Bludgeoning,  Piercing")).toBe("bludgeoning, piercing");
  });

  it("is idempotent over every shipped vocabulary value", () => {
    for (const v of [...DAMAGE_TYPES, ...DAMAGE_NONMAGICAL_VARIANTS, ...CONDITION_SLUGS]) {
      expect(toDefenseSlug(toDefenseSlug(v))).toBe(toDefenseSlug(v));
    }
  });

  it("is collision-free within each vocabulary", () => {
    const slugs = DAMAGE_TYPES.map(toDefenseSlug);
    expect(new Set(slugs).size).toBe(DAMAGE_TYPES.length);
  });

  it("is the identity over CONDITION_SLUGS, which are already canonical", () => {
    for (const s of CONDITION_SLUGS) expect(toDefenseSlug(s)).toBe(s);
  });
});
