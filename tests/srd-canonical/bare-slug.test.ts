import { describe, it, expect } from "vitest";
import { bareSlug } from "../../tools/srd-canonical/merger-rules/class-merge";

// Regression guard for the arity-robust owner-slug strip used to build overlay
// keys. Type-namespaced canonical slugs are 3-part `<prefix>_<type>_<name>`
// (e.g. `srd-2024_subclass_champion`); the pre-fix strip (`slice after first
// "_"`) yielded `subclass_champion`, silently breaking owner-scoped overlay
// lookups. Name-slugs never contain `_`, so `slice(2).join("_")` is the
// unambiguous bare name for 3-part slugs while legacy 2-part and bare slugs
// still resolve to their trailing segment.
describe("bareSlug (owner bare-slug for overlay keys)", () => {
  it("strips prefix + entity_type from a 3-part class slug", () => {
    expect(bareSlug("srd-5e_class_fighter")).toBe("fighter");
  });

  it("strips prefix + entity_type from a 3-part subclass slug", () => {
    expect(bareSlug("srd-2024_subclass_champion")).toBe("champion");
  });

  it("strips only the prefix from a legacy 2-part slug", () => {
    expect(bareSlug("srd-5e_fighter")).toBe("fighter");
  });

  it("returns a bare slug unchanged", () => {
    expect(bareSlug("fighter")).toBe("fighter");
  });
});
