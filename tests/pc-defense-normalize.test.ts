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
    const vocabularies: Array<[string, readonly string[]]> = [
      ["DAMAGE_TYPES", DAMAGE_TYPES],
      ["DAMAGE_NONMAGICAL_VARIANTS", DAMAGE_NONMAGICAL_VARIANTS],
      ["CONDITION_SLUGS", CONDITION_SLUGS],
    ];
    for (const [name, values] of vocabularies) {
      const slugs = values.map((v) => toDefenseSlug(v));
      expect(new Set(slugs).size, `${name} collides under toDefenseSlug`).toBe(values.length);
    }
  });

  // Ledger ruling C-1: the popover option list and the `overrides.defenses` suppression store are
  // keyed by toDefenseSlug across damage types AND conditions in ONE keyspace. Tasks 6, 7, 8 and 12
  // inherit this invariant, so it is asserted here rather than left as a measured-once observation.
  it("is collision-free across the UNION of all three vocabularies, which share one keyspace", () => {
    const union = [...DAMAGE_TYPES, ...DAMAGE_NONMAGICAL_VARIANTS, ...CONDITION_SLUGS];
    const slugs = union.map((v) => toDefenseSlug(v));
    expect(new Set(slugs).size).toBe(union.length);
  });

  it("is the identity over CONDITION_SLUGS, which are already canonical", () => {
    for (const s of CONDITION_SLUGS) expect(toDefenseSlug(s)).toBe(s);
  });
});
