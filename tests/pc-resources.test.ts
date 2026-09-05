import { describe, it, expect } from "vitest";
import { resourceLevelFor } from "../src/pc/pc.resources";
import type { ResolvedCharacter } from "../src/pc/pc.types";

/** A Barbarian 5 / Fighter 5 whose Fighter has the Battle Master subclass. */
const multiclass = {
  totalLevel: 10,
  classes: [
    { entity: { slug: "phb_class_barbarian" }, level: 5, subclass: null, choices: {} },
    { entity: { slug: "phb_class_fighter" }, level: 5, subclass: { slug: "phb_subclass_battle-master" }, choices: {} },
  ],
} as unknown as ResolvedCharacter;

describe("resourceLevelFor (R4-G4 §6.2.4)", () => {
  it("a class source resolves at that class's level, not the total", () => {
    expect(resourceLevelFor({ kind: "class", slug: "phb_class_barbarian", level: 1 }, multiclass)).toBe(5);
  });
  it("a subclass source resolves at the OWNING class's level", () => {
    expect(resourceLevelFor({ kind: "subclass", slug: "phb_subclass_battle-master", level: 3 }, multiclass)).toBe(5);
  });
  it("race / feat / background sources and an unknown class resolve at the total level", () => {
    expect(resourceLevelFor({ kind: "race", slug: "x" }, multiclass)).toBe(10);
    expect(resourceLevelFor({ kind: "class", slug: "nope", level: 1 }, multiclass)).toBe(10);
  });
});
