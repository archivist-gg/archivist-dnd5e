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
});
