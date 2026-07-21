import { describe, it, expect } from "vitest";
import { buildBaseResolutionPredicate } from "../tools/srd-canonical/base-item-remap";
import { gatedStructuredBaseItem } from "../tools/srd-canonical/merger-rules/item-merge";

// P2 D5: the item-merge structured fallback must emit a base_item link ONLY
// when the base name resolves to a real registered weapon/armor/shield base.
// Rod of Lordly Might -> Mace, Sun Blade -> Longsword, etc. resolve and keep
// their link; Horn of Blasting ("wondrous item", weapon:null/armor:null) does
// NOT resolve and must drop the spurious [[.../Weapons/Horn]] link.
describe("D5 structured-fallback gate (gatedStructuredBaseItem)", () => {
  const pred = buildBaseResolutionPredicate(["Mace", "Longsword", "Warhammer", "Plate Armor", "Shield"]);

  it("emits base_item for a real base (Rod of Lordly Might -> Mace)", () => {
    expect(gatedStructuredBaseItem("mace|phb", "2014", "weapon", pred)).toBe("[[SRD 5e/Weapons/Mace]]");
  });

  it("drops base_item for a non-base (Horn, both editions)", () => {
    expect(gatedStructuredBaseItem("horn|phb", "2014", "weapon", pred)).toBeUndefined();
    expect(gatedStructuredBaseItem("horn|xphb", "2024", "weapon", pred)).toBeUndefined();
  });

  it("permissive default: null predicate emits unchanged (direct-call path)", () => {
    // No predicate set (every direct unit-test call and non-generator run):
    // the gate is OFF and the raw fallback emits, even for a non-base name.
    expect(gatedStructuredBaseItem("horn|phb", "2014", "weapon", null)).toBe("[[SRD 5e/Weapons/Horn]]");
    expect(gatedStructuredBaseItem("mace|phb", "2014", "weapon", null)).toBe("[[SRD 5e/Weapons/Mace]]");
  });
});
