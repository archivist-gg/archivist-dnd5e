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

describe("parseItem: scroll / unidentified marker fields", () => {
  it("keeps scroll_level on the entity (not shunted into raw)", () => {
    const res = parseItem(`
name: Test Spell Scroll
slug: test-spell-scroll
type: scroll
scroll_level: 3
`);
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.scroll_level).toBe(3);
    expect(res.data.raw?.scroll_level).toBeUndefined();
  });

  it("keeps unidentified/masked_category on the entity (not shunted into raw)", () => {
    const res = parseItem(`
name: Mystery Vial
slug: mystery-vial
type: potion
unidentified: true
masked_category: potion
`);
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.unidentified).toBe(true);
    expect(res.data.masked_category).toBe("potion");
    expect(res.data.raw?.unidentified).toBeUndefined();
    expect(res.data.raw?.masked_category).toBeUndefined();
  });
});
