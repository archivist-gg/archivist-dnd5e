import { describe, it, expect } from "vitest";
import { attackSchema } from "../src/schemas/attack-schema";

/** R4-G6 §5: the `Attack` INTERFACE declares `bonus` and `extra_damage`; the SCHEMA did not, and zod v4 strips
 *  undeclared keys, so 8,176 monster attack bonuses and 1,796 extra-damage riders vanished through any zod path. */
describe("attackSchema keeps the two Attack members it used to strip (R4-G6 §5)", () => {
  const attack = { name: "Bite", type: "melee", bonus: 19, damage: "2d12 + 10", damage_type: "piercing",
    extra_damage: { dice: "3d12", type: "force" }, range: { reach: 20 }, action: "action" };

  it("keeps bonus", () => {
    const r = attackSchema.safeParse(attack);
    expect(r.success && (r.data as { bonus?: number }).bonus).toBe(19);
  });
  it("keeps extra_damage.dice and .type", () => {
    const r = attackSchema.safeParse(attack);
    expect(r.success && (r.data as { extra_damage?: { dice: string; type: string } }).extra_damage).toEqual({ dice: "3d12", type: "force" });
  });
  it("still refuses an unknown attack type", () => {
    expect(attackSchema.safeParse({ ...attack, type: "psionic" }).success).toBe(false);
  });
});
