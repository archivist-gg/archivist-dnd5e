import { describe, it, expect } from "vitest";
import {
  normalizeBaseName,
  buildBaseEntityIndex,
  remapVariantBaseItem,
  buildBaseResolutionPredicate,
  structuredBaseResolves,
} from "../tools/srd-canonical/base-item-remap";

describe("normalizeBaseName", () => {
  it("bridges long link names to short registered names", () => {
    expect(normalizeBaseName("Plate Armor")).toBe(normalizeBaseName("Plate"));
    expect(normalizeBaseName("Studded Leather Armor")).toBe(normalizeBaseName("Studded leather"));
    expect(normalizeBaseName("Half Plate Armor")).toBe(normalizeBaseName("Half plate"));
  });
  it("bridges comma-inverted crossbows", () => {
    expect(normalizeBaseName("Hand Crossbow")).toBe(normalizeBaseName("Crossbow, hand"));
    expect(normalizeBaseName("Light Crossbow")).toBe(normalizeBaseName("Crossbow, light"));
    expect(normalizeBaseName("Heavy Crossbow")).toBe(normalizeBaseName("Crossbow, heavy"));
  });
  it("bridges hyphenated 5etools slugs (D5 structured.baseItem form)", () => {
    expect(normalizeBaseName("hand-crossbow")).toBe(normalizeBaseName("Crossbow, hand"));
    expect(normalizeBaseName("plate-armor")).toBe(normalizeBaseName("Plate"));
    expect(normalizeBaseName("studded-leather-armor")).toBe(normalizeBaseName("Studded leather"));
  });
  it("keeps distinct bases distinct", () => {
    expect(normalizeBaseName("Leather")).not.toBe(normalizeBaseName("Studded leather"));
    expect(normalizeBaseName("Crossbow, hand")).not.toBe(normalizeBaseName("Crossbow, heavy"));
  });
});

describe("buildBaseEntityIndex", () => {
  const entities = [
    { name: "Plate", type: "armor" as const, edition: "2014" },
    { name: "Studded leather", type: "armor" as const, edition: "2014" },
    { name: "Crossbow, hand", type: "weapon" as const, edition: "2014" },
    { name: "Shield", type: "armor" as const, edition: "2014" },
  ];
  it("indexes by normalized <type>:<name>", () => {
    const idx = buildBaseEntityIndex(entities);
    expect(idx.get(`armor:${normalizeBaseName("Plate Armor")}`)).toBe("Plate");
    expect(idx.get(`weapon:${normalizeBaseName("Hand Crossbow")}`)).toBe("Crossbow, hand");
    expect(idx.get(`armor:${normalizeBaseName("Shield")}`)).toBe("Shield");
  });
  it("throws on a normalized-key collision within one (edition,type)", () => {
    expect(() =>
      buildBaseEntityIndex([
        { name: "Plate", type: "armor", edition: "2014" },
        { name: "Plate Armor", type: "armor", edition: "2014" }, // normalizes to same key
      ]),
    ).toThrow(/collision/i);
  });
});

describe("remapVariantBaseItem", () => {
  const idx = buildBaseEntityIndex([
    { name: "Plate", type: "armor", edition: "2014" },
    { name: "Crossbow, hand", type: "weapon", edition: "2014" },
  ]);
  it("rewrites a long link to the registered-name path", () => {
    expect(remapVariantBaseItem("[[SRD 5e/Armor/Plate Armor]]", idx)).toBe("[[SRD 5e/Armor/Plate]]");
    expect(remapVariantBaseItem("[[SRD 5e/Weapons/Hand Crossbow]]", idx)).toBe("[[SRD 5e/Weapons/Crossbow, hand]]");
  });
  it("falls back to the original link when the base is not in the index", () => {
    expect(remapVariantBaseItem("[[SRD 5e/Weapons/Horn]]", idx)).toBe("[[SRD 5e/Weapons/Horn]]");
  });
});

describe("structuredBaseResolves (D5)", () => {
  const pred = buildBaseResolutionPredicate(["Mace", "Longsword", "Warhammer", "Plate Armor", "Shield"]);
  it("keeps real weapon/armor bases (Rod->Mace, Sun Blade->Longsword)", () => {
    expect(structuredBaseResolves("mace|phb", pred)).toBe(true);
    expect(structuredBaseResolves("longsword|phb", pred)).toBe(true);
  });
  it("keeps a hyphenated multi-word base (hand-crossbow slug vs 'Hand Crossbow' predicate)", () => {
    const p = buildBaseResolutionPredicate(["Hand Crossbow", "Mace"]);
    expect(structuredBaseResolves("hand-crossbow|phb", p)).toBe(true);
  });
  it("drops non-bases (Horn)", () => {
    expect(structuredBaseResolves("horn|phb", pred)).toBe(false);
  });
});
