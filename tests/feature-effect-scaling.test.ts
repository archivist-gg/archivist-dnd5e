import { describe, it, expect } from "vitest";
import { featureEffectSchema } from "../src/schemas/feature-effect-schema";
import { computeFeatureEffects } from "../src/pc/pc.feature-effects";
import type { ResolvedFeature } from "../src/pc/pc.types";

// R4-G7 §7.3 (spec §15 row 5): `extra-attack` and `speed-bonus` carry their whole progression INSIDE the
// effect, because the overlay's `class_features` map has no level component and, after §7.1's fold, the sheet
// reads exactly ONE copy of a repeated feature. The engine resolves `scales_at` against the effect's OWN
// source level (the `resourceLevelFor` rule the caller passes as `levelFor`), never the total level.
// `count` and every `scales_at[].count` are EXTRA attacks, not total attacks.

const EXTRA_ATTACK = { kind: "extra-attack", count: 1, scales_at: [{ level: 11, count: 2 }, { level: 20, count: 3 }] };
const SPEED_BONUS = { kind: "speed-bonus", mode: "walk", value: 10, scales_at: [{ level: 6, value: 15 }, { level: 18, value: 30 }] };

/** One feature, one class source, folded at the level `levelFor` reports. The cast is the tests/ idiom: this
 *  file authors RAW effect shapes so the schema arm and the engine read the same literal. */
const fold = (effects: unknown[], level?: number) =>
  computeFeatureEffects(
    [{ feature: { id: "f", name: "Effect Source", effects }, source: { kind: "class", slug: "fighter", level: 5 } } as unknown as ResolvedFeature],
    level === undefined ? {} : { levelFor: () => level },
  );

describe("the effect scaling arms (spec §7.3)", () => {
  it("the schema KEEPS scales_at on the extra-attack arm", () => {
    // RED FIRST: `z.object` strips an undeclared key, so this parsed green and returned the effect WITHOUT
    // its progression. The assertion is on the OUTPUT, never on `.success`.
    expect(featureEffectSchema.parse(EXTRA_ATTACK)).toEqual(EXTRA_ATTACK);
    expect(featureEffectSchema.safeParse({ kind: "extra-attack", count: 1, scales_at: [{ level: 21, count: 2 }] }).success).toBe(false);
    expect(featureEffectSchema.safeParse({ kind: "extra-attack", count: 1, scales_at: [{ level: 11, count: 0 }] }).success).toBe(false);
  });

  it("the schema KEEPS scales_at on the speed-bonus arm", () => {
    expect(featureEffectSchema.parse(SPEED_BONUS)).toEqual(SPEED_BONUS);
    expect(featureEffectSchema.safeParse({ kind: "speed-bonus", mode: "walk", value: 10, scales_at: [{ level: 0, value: 15 }] }).success).toBe(false);
  });

  it("extra-attack resolves scales_at against the level levelFor reports (m6's kill row)", () => {
    expect(fold([EXTRA_ATTACK], 11).extraAttack).toBe(2);        // RED FIRST: the base count at every level
    expect(fold([EXTRA_ATTACK], 10).extraAttack).toBe(1);        // 1 EXTRA attack, so 2 attacks
    expect(fold([EXTRA_ATTACK], 20).extraAttack).toBe(3);        // 3 EXTRA attacks, so 4 attacks
    expect(fold([EXTRA_ATTACK], 1).extraAttack).toBe(1);
    expect(fold([EXTRA_ATTACK]).extraAttack).toBe(1);            // no levelFor: the base value
  });

  it("speed-bonus resolves scales_at the same way", () => {
    expect(fold([SPEED_BONUS], 6).speed_walk_bonus).toBe(15);    // RED FIRST: the base 10 at every level
    expect(fold([SPEED_BONUS], 18).speed_walk_bonus).toBe(30);
    expect(fold([SPEED_BONUS], 5).speed_walk_bonus).toBe(10);
    expect(fold([SPEED_BONUS]).speed_walk_bonus).toBe(10);
  });

  it("a `set: true` speed-bonus scales in its own floor (no shipped document combines them yet; the rule is pinned)", () => {
    const setEffect = { kind: "speed-bonus", mode: "walk", value: 30, set: true, scales_at: [{ level: 10, value: 40 }, { level: 18, value: 60 }] };
    expect(fold([setEffect], 10).speed_walk_set).toBe(40);       // RED FIRST: the base 30 at every level
    expect(fold([setEffect], 18).speed_walk_set).toBe(60);
    expect(fold([setEffect], 9).speed_walk_set).toBe(30);
    expect(fold([setEffect], 18).speed_walk_bonus).toBe(0);      // the floor is tracked apart from the additive bonus
  });

  it("an UNSORTED scales_at still picks the highest entry at or below the level", () => {
    const unsorted = { kind: "extra-attack", count: 1, scales_at: [{ level: 20, count: 3 }, { level: 11, count: 2 }] };
    expect(fold([unsorted], 11).extraAttack).toBe(2);
    expect(fold([unsorted], 19).extraAttack).toBe(2);
    expect(fold([unsorted], 20).extraAttack).toBe(3);
  });

  it("two extra-attack effects still do not stack: the highest RESOLVED count wins", () => {
    expect(fold([EXTRA_ATTACK, { kind: "extra-attack", count: 1 }], 11).extraAttack).toBe(2);
    expect(fold([{ kind: "extra-attack", count: 1 }, { kind: "extra-attack", count: 1 }], 11).extraAttack).toBe(1);
  });

  it("the two arms keep their discriminator and the union still refuses an unknown kind (the `_kindPin` guarantee; CONTROL)", () => {
    expect(featureEffectSchema.parse({ kind: "extra-attack", count: 1 }).kind).toBe("extra-attack");
    expect(featureEffectSchema.parse({ kind: "speed-bonus", mode: "walk", value: 10 }).kind).toBe("speed-bonus");
    expect(featureEffectSchema.safeParse({ kind: "extra-attacks", count: 1 }).success).toBe(false);
  });
});
