import { describe, it, expect } from "vitest";
import { parseMonster } from "../src/monster/monster.parser";

describe("the raw bag and the nested-strip policy (R4-G6 §3.1, §3.3)", () => {
  it("relocates an undeclared TOP-LEVEL key into raw and keeps it off the entity", () => {
    const r = parseMonster("name: X\n__future_key__: 1");
    expect(r.success && (r.data as { raw?: Record<string, unknown> }).raw?.__future_key__).toBe(1);
    expect(r.success && "__future_key__" in (r.data as object)).toBe(false);
  });
  it("strips an undeclared NESTED key (deliberate; the census reports it)", () => {
    const r = parseMonster("name: X\ntraits:\n  - name: T\n    entries: ['x']\n    __future__: 1");
    expect(r.success && (r.data as unknown as { traits: Record<string, unknown>[] }).traits[0].__future__).toBeUndefined();
  });
  it("the AI path's top-level xp / proficiency_bonus land in raw", () => {
    const r = parseMonster("name: X\nxp: 50\nproficiency_bonus: 2");
    expect(r.success && (r.data as { raw?: Record<string, unknown> }).raw).toEqual({ xp: 50, proficiency_bonus: 2 });
  });
});
