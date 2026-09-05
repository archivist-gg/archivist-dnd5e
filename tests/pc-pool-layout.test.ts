import { describe, it, expect } from "vitest";
import { RENDERING_HINT_LAYOUT, derivePoolLayout } from "../src/pc/pool-layout";
import type { ResolvedPoolEntry } from "../src/pc/pc.types";

const hinted = (slug: string, rendering_hint: string): ResolvedPoolEntry =>
  ({ slug, entity: { slug, name: slug, rendering_hint } } as unknown as ResolvedPoolEntry);

describe("derivePoolLayout (R4-G4 §4.2.2)", () => {
  it("the table maps exactly the two G4 hints", () => {
    expect(RENDERING_HINT_LAYOUT).toEqual({ "dice-pool": "dice-pool", "point-pool": "point-pool" });
  });
  it("majority of the MAPPED hints wins; empty and unmapped hints do not vote", () => {
    const members = [hinted("a", "dice-pool"), hinted("b", "dice-pool"), hinted("c", "granted-die-to-ally"), hinted("d", "")];
    expect(derivePoolLayout(members)).toBe("dice-pool");
  });
  it("no mapped vote → undefined (Warlock invocations, fighting styles, Arcane Archer)", () => {
    expect(derivePoolLayout([hinted("a", ""), hinted("b", "pool-selection")])).toBeUndefined();
    expect(derivePoolLayout([])).toBeUndefined();
  });
  it("a TIE between two mapped values → undefined, the honest answer (Gate 0 Q8)", () => {
    expect(derivePoolLayout([hinted("a", "dice-pool"), hinted("b", "point-pool")])).toBeUndefined();
  });
  it("an Object.prototype key is an UNMAPPED hint, not a vote (review M-2)", () => {
    // `rendering_hint` is a free `z.string().optional()` on converter data, so a member can carry any
    // string. A plain-object table answers "constructor" and "toString" through the PROTOTYPE chain, so
    // an inherited function passed the truthiness guard: one junk member suppressed a real dice-pool
    // majority into a phantom tie, and a lone junk member voted a FUNCTION as the layout.
    expect(derivePoolLayout([hinted("a", "dice-pool"), hinted("b", "constructor")])).toBe("dice-pool");
    expect(derivePoolLayout([hinted("a", "constructor")])).toBeUndefined();
    expect(derivePoolLayout([hinted("a", "toString"), hinted("b", "hasOwnProperty")])).toBeUndefined();
  });
});
