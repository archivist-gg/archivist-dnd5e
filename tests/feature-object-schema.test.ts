import { describe, it, expect } from "vitest";
import { z } from "zod";
import type { Feature } from "../src/types/feature";
import { featureObjectSchema, featureSchema } from "../src/schemas/feature-schema";

/** R4-G6 §4.2: the feature OBJECT is declared once and exported un-refined for the monster schema; the refined
 *  `featureSchema` (description or non-empty entries) keeps its exported `z.ZodType<unknown>` for every other root. */
describe("featureObjectSchema (R4-G6 §4.2)", () => {
  it("accepts a name-only feature that the refined schema refuses", () => {
    expect(featureObjectSchema.safeParse({ name: "Amphibious" }).success).toBe(true);
    expect(featureSchema.safeParse({ name: "Amphibious" }).success).toBe(false);
  });
  it("is typed against Feature: a wrong leaf fails to assign at compile time", () => {
    // Compile-time check only: the object schema's output assigns to Feature[] under `satisfies`.
    const probe = z.object({ traits: z.array(featureObjectSchema).optional() }) satisfies z.ZodType<{ traits?: Feature[] }>;
    expect(Object.keys(probe.shape)).toEqual(["traits"]);
  });
  it("keeps the recursion: a sub_feature still needs description or entries", () => {
    const r = featureObjectSchema.safeParse({ name: "Outer", entries: ["x"], sub_features: [{ name: "Inner" }] });
    expect(r.success).toBe(false);
  });
});
