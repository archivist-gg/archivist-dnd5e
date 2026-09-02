import { describe, it, expect } from "vitest";
import { resourceConsumptionSchema } from "../src/schemas/resource-schema";
import { featureSchema } from "../src/schemas/feature-schema";  // z.ZodType<unknown> (a z.lazy): read values through a cast

describe("consumes.amount_max (R4-G3a §9)", () => {
  it("is DECLARED: the key survives the parse", () => {
    const r = resourceConsumptionSchema.safeParse({ resource: "ki", amount: 1, amount_max: 5 });
    expect(r.success).toBe(true);
    expect(r.success && r.data.amount_max).toBe(5);          // was RED before the declare: the key was stripped (undefined)
  });

  it("the 294-carrier shape (no amount_max) parses and carries no key", () => {
    const r = resourceConsumptionSchema.safeParse({ resource: "ki", amount: 1 });
    expect(r.success).toBe(true);
    expect(r.success && "amount_max" in r.data).toBe(false);
  });

  it("amount_max < amount is refused", () => {
    expect(resourceConsumptionSchema.safeParse({ resource: "ki", amount: 3, amount_max: 2 }).success).toBe(false);
  });

  it("a feature with consumes {resource, amount} still parses with the value intact", () => {
    const r = featureSchema.safeParse({ name: "X", description: "d", consumes: { resource: "ki", amount: 2 } });
    expect(r.success && (r.data as { consumes?: { amount?: number } }).consumes?.amount).toBe(2);
  });
});
