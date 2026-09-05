import { describe, it, expect } from "vitest";
import { resourceSchema } from "../src/schemas/resource-schema";

const base = { id: "w", name: "Arcane Recovery", max_formula: "1", reset: "long-rest" };
const rec = (extra: object) => ({ id: "w:r", name: "Recover spell slots", amount: "ceil({class_level}/2)", reset: "long-rest", ...extra });

describe("recovery[].restores (R4-G4 §7.2.1)", () => {
  it("accepts uses and spell-slots, rejects hp", () => {
    expect(resourceSchema.safeParse({ ...base, recovery: [rec({ restores: "spell-slots" })] }).success).toBe(true);
    expect(resourceSchema.safeParse({ ...base, recovery: [rec({ restores: "uses" })] }).success).toBe(true);
    const bad = resourceSchema.safeParse({ ...base, recovery: [rec({ restores: "hp" })] });
    expect(bad.success).toBe(false);
  });
  it("is optional and adds NO default to the parsed shape (the sheet reads RAW entities, invariant 1)", () => {
    const parsed = resourceSchema.parse({ ...base, recovery: [rec({})] });
    expect("restores" in parsed.recovery![0]).toBe(false);
  });
});
