import { describe, it, expect } from "vitest";
import { parseItem } from "../src/item/item.parser";

describe("parseItem — damage_riders", () => {
  it("parses a structured damage_riders field into entity.damage_riders (not raw)", () => {
    const res = parseItem(`
name: Test Flamebrand
slug: test-flamebrand
type: weapon
damage_riders:
  - { amount: "2d6", damage_type: fire }
`);
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.damage_riders).toEqual([{ amount: "2d6", damage_type: "fire" }]);
    expect(res.data.raw?.damage_riders).toBeUndefined();
  });
});
