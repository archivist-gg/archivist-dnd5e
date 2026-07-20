import { describe, it, expect } from "vitest";
import { baseClassName } from "@archivist-gg/dnd5e/class/class.slug";

// Phase-1 slug namespacing (Task 3): class refs are migrating from a 2-part
// `<compendium>_<name>` shape to a 3-part `<compendium>_<type>_<name>` shape.
// baseClassName first unwraps the wikilink + lowercases (via bareSlug), THEN must
// strip the prefix arity-robustly so a namespaced ref still yields the canonical
// class key (`wizard`).
describe("baseClassName — arity-robust prefix strip", () => {
  it("is arity-robust across bare / 2-part / 3-part slugs", () => {
    expect(baseClassName("wizard")).toBe("wizard");
    expect(baseClassName("srd-5e_wizard")).toBe("wizard");
    expect(baseClassName("srd-2024_class_wizard")).toBe("wizard");
  });
  it("still unwraps a wikilink and lowercases before stripping", () => {
    expect(baseClassName("[[Wizard]]")).toBe("wizard");
    expect(baseClassName("[[srd-2024_class_Wizard]]")).toBe("wizard");
  });
});
