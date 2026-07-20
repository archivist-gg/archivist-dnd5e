import { describe, it, expect } from "vitest";
import { bareEntitySlug } from "@archivist-gg/dnd5e/pc/pc.decision-engine";

// Phase-1 slug namespacing (Task 3): entity slugs are migrating from a 2-part
// `<prefix>_<name>` shape to a 3-part `<prefix>_<type>_<name>` shape. bareEntitySlug
// must return the bare NAME for all arities — bare (0 `_`), legacy 2-part, and the
// new 3-part namespaced form — while still degrading to "" on a nullish slug.
// Name-slugs never contain `_`, so `parts.slice(2).join("_")` is the unambiguous
// bare name for any 3-part (or longer) slug.
describe("bareEntitySlug — arity-robust prefix strip", () => {
  it("is arity-robust across bare / 2-part / 3-part slugs", () => {
    expect(bareEntitySlug("bedevil")).toBe("bedevil");
    expect(bareEntitySlug("srd-5e_greatsword")).toBe("greatsword");
    expect(bareEntitySlug("srd-2024_weapon_greatsword")).toBe("greatsword");
    expect(bareEntitySlug("mcdm_optional-feature_bedevil")).toBe("bedevil");
  });
  it("degrades to '' on a nullish/empty slug instead of throwing", () => {
    expect(bareEntitySlug(undefined)).toBe("");
    expect(bareEntitySlug(null)).toBe("");
    expect(bareEntitySlug("")).toBe("");
  });
});
