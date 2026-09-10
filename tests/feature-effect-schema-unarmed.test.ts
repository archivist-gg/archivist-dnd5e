import { describe, it, expect } from "vitest";
import { featureEffectSchema } from "../src/schemas/feature-effect-schema";

describe("featureEffectSchema · the unarmed-strike arm (R4-G6b §5.2)", () => {
  it("parses a flat die, a column die with abilities, and a bare kind", () => {
    expect(featureEffectSchema.parse({ kind: "unarmed-strike", dice: "1d4" })).toEqual({ kind: "unarmed-strike", dice: "1d4" });
    expect(featureEffectSchema.parse({ kind: "unarmed-strike", dice: { column: "Martial Arts" }, abilities: ["dex"] }))
      .toEqual({ kind: "unarmed-strike", dice: { column: "Martial Arts" }, abilities: ["dex"] });
    expect(featureEffectSchema.parse({ kind: "unarmed-strike", subject: "self" })).toEqual({ kind: "unarmed-strike", subject: "self" });
  });
  it("rejects an empty die string and an empty abilities list", () => {
    expect(featureEffectSchema.safeParse({ kind: "unarmed-strike", dice: "" }).success).toBe(false);
    expect(featureEffectSchema.safeParse({ kind: "unarmed-strike", abilities: [] }).success).toBe(false);
  });
  // R4-G7 §7.2, the ONE code change of the Unarmed Strike booking: the flat `dice` string is a bare die
  // expression, `<count>d<faces>`, because `resolveUnarmedStrike` averages it with /^(\d+)d(\d+)$/ and any
  // other spelling silently averages as 1. The case-insensitive arm keeps an authored `1D6` legal.
  it("rejects a die with no count, no faces or a modifier tail, and accepts an uppercase D", () => {
    expect(featureEffectSchema.safeParse({ kind: "unarmed-strike", dice: "1d6+1" }).success).toBe(false);
    expect(featureEffectSchema.safeParse({ kind: "unarmed-strike", dice: "d6" }).success).toBe(false);
    expect(featureEffectSchema.safeParse({ kind: "unarmed-strike", dice: "1d" }).success).toBe(false);
    expect(featureEffectSchema.parse({ kind: "unarmed-strike", dice: "1D6" })).toEqual({ kind: "unarmed-strike", dice: "1D6" });
    expect(featureEffectSchema.parse({ kind: "unarmed-strike", dice: "2d10" })).toEqual({ kind: "unarmed-strike", dice: "2d10" });
  });
});
