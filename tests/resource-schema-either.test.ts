import { describe, it, expect } from "vitest";
import { resourceSchema } from "../src/schemas/resource-schema";

// R4-G3a §8.2 (i): `resetTriggerEnum` gains "either", the trigger for the 43
// "short OR long rest" rows. Assertions are on the parse OUTPUT, never on
// `success` alone: zod strips unknown keys, so a schema that quietly dropped
// `reset` would still report success.

describe('resourceSchema · reset: "either" (R4-G3a §8.2)', () => {
  it('accepts "either" and carries it through to the parsed data', () => {
    const r = resourceSchema.safeParse({ id: "g3:e", name: "E", max_formula: "1", reset: "either" });
    if (!r.success) throw new Error(`refused: ${JSON.stringify(r.error.issues)}`);
    expect(r.data.reset).toBe("either");
    expect(r.data).toEqual({ id: "g3:e", name: "E", max_formula: "1", reset: "either" });
  });

  it("still refuses a reset trigger outside the enum", () => {
    const r = resourceSchema.safeParse({ id: "g3:e", name: "E", max_formula: "1", reset: "bogus" });
    expect(r.success).toBe(false);
    expect(r.success ? [] : r.error.issues.map((i) => i.path.join("."))).toEqual(["reset"]);
  });

  it('accepts "either" on a recovery[] entry too (the enum has three mounts)', () => {
    const r = resourceSchema.safeParse({
      id: "g3:e", name: "E", max_formula: "1", reset: "long-rest",
      recovery: [{ id: "g3:e:rec", name: "R", amount: "1", reset: "either" }],
    });
    if (!r.success) throw new Error(`refused: ${JSON.stringify(r.error.issues)}`);
    expect(r.data.recovery?.[0].reset).toBe("either");
  });
});
