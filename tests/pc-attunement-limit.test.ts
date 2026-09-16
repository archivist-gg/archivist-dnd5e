/**
 * The attunement cap is DATA, not a constant.
 *
 * Before this suite the limit was a literal `3` in two places (`pc.equipment.ts`
 * and `pc.recalc.ts`), reachable only by a manual per-character override, so the
 * Artificer's Magic Item Adept / Savant / Master line ("attune to up to four /
 * five / six") was inert prose. The `attunement-limit` effect makes it fold like
 * any other grant; `scales_at` carries the whole 10 / 14 / 18 progression on ONE
 * effect, the Unarmored Movement shape (R4-G7 §7.3), because the overlay has no
 * level axis.
 */
import { describe, it, expect } from "vitest";
import { featureEffectSchema } from "../src/schemas/feature-effect-schema";
import { computeFeatureEffects } from "../src/pc/pc.feature-effects";
import type { FeatureEffect } from "../src/types/feature-effect";
import type { ResolvedFeature } from "../src/pc/pc.types";

const ADEPT: FeatureEffect = {
  kind: "attunement-limit",
  value: 4,
  scales_at: [{ level: 14, value: 5 }, { level: 18, value: 6 }],
} as FeatureEffect;

const feat = (effects: FeatureEffect[], level = 10): ResolvedFeature =>
  ({
    feature: { name: "Magic Item Adept", description: "x", effects },
    source: { kind: "class", slug: "artificer", level },
  }) as unknown as ResolvedFeature;

describe("attunement-limit effect — schema", () => {
  it("accepts the Artificer shape", () => {
    expect(featureEffectSchema.safeParse(ADEPT).success).toBe(true);
  });

  it("accepts a bare value with no progression", () => {
    expect(featureEffectSchema.safeParse({ kind: "attunement-limit", value: 4 }).success).toBe(true);
  });

  it("rejects a zero, negative or fractional cap", () => {
    for (const value of [0, -1, 2.5]) {
      expect(featureEffectSchema.safeParse({ kind: "attunement-limit", value }).success).toBe(false);
    }
  });

  it("rejects a scales_at level outside 1..20", () => {
    expect(
      featureEffectSchema.safeParse({ kind: "attunement-limit", value: 4, scales_at: [{ level: 21, value: 6 }] }).success,
    ).toBe(false);
  });
});

describe("attunement-limit effect — fold", () => {
  it("is 0 (meaning: no grant) when nothing grants it", () => {
    expect(computeFeatureEffects([feat([])]).attunement_set).toBe(0);
  });

  it("takes the effect's base value with no level context", () => {
    expect(computeFeatureEffects([feat([ADEPT])]).attunement_set).toBe(4);
  });

  it("resolves the progression at the effect's own source level", () => {
    const at = (level: number): number =>
      computeFeatureEffects([feat([ADEPT], level)], { levelFor: () => level }).attunement_set;
    expect(at(10)).toBe(4);
    expect(at(13)).toBe(4);
    expect(at(14)).toBe(5);
    expect(at(17)).toBe(5);
    expect(at(18)).toBe(6);
    expect(at(20)).toBe(6);
  });

  it("keeps the HIGHEST grant when two features both raise the cap", () => {
    const other: FeatureEffect = { kind: "attunement-limit", value: 5 } as FeatureEffect;
    expect(computeFeatureEffects([feat([ADEPT]), feat([other])]).attunement_set).toBe(5);
  });

  it("never lowers the cap: a grant below the baseline folds as itself, and recalc maxes against 3", () => {
    const small: FeatureEffect = { kind: "attunement-limit", value: 1 } as FeatureEffect;
    expect(computeFeatureEffects([feat([small])]).attunement_set).toBe(1);
  });
});
