import { describe, it, expect } from "vitest";
import { classifyWeaponRange } from "../src/weapon/weapon.classify";
import w2014 from "../src/srd/data/runtime/weapon.2014.json";
import w2024 from "../src/srd/data/runtime/weapon.2024.json";
import type { WeaponEntity } from "../src/weapon/weapon.types";

const find = (list: unknown, name: string): WeaponEntity => {
  const arr = (Array.isArray(list) ? list : Object.values(list as object)) as WeaponEntity[];
  const e = arr.find((w) => w.name.toLowerCase() === name);
  if (!e) throw new Error(`missing fixture weapon: ${name}`);
  return e;
};

describe("classifyWeaponRange", () => {
  it("throwable melee: dagger (2024) = melee 5 ft + thrown 20/60", () => {
    expect(classifyWeaponRange(find(w2024, "dagger"))).toEqual({
      melee: { reach: 5 }, ranged: { normal: 20, long: 60, thrown: true },
    });
  });
  it("throwable melee: spear (2024)", () => {
    expect(classifyWeaponRange(find(w2024, "spear"))).toEqual({
      melee: { reach: 5 }, ranged: { normal: 20, long: 60, thrown: true },
    });
  });
  it("2014 handaxe self-heals despite missing thrown property", () => {
    const h = find(w2014, "handaxe");
    expect(h.properties).not.toContain("thrown"); // guards the data premise
    expect(classifyWeaponRange(h)).toEqual({
      melee: { reach: 5 }, ranged: { normal: 20, long: 60, thrown: true },
    });
  });
  it("reach melee: glaive (2024) = 10 ft, no ranged", () => {
    expect(classifyWeaponRange(find(w2024, "glaive"))).toEqual({ melee: { reach: 10 }, ranged: null });
  });
  it("reach melee: whip (2014) = 10 ft", () => {
    expect(classifyWeaponRange(find(w2014, "whip"))).toEqual({ melee: { reach: 10 }, ranged: null });
  });
  it("pure ranged via ammunition: longbow (2024) 150/600, no melee", () => {
    expect(classifyWeaponRange(find(w2024, "longbow"))).toEqual({
      melee: null, ranged: { normal: 150, long: 600, thrown: false },
    });
  });
  it("pure ranged: sling + blowgun (2014)", () => {
    expect(classifyWeaponRange(find(w2014, "sling")).melee).toBeNull();
    expect(classifyWeaponRange(find(w2014, "blowgun")).melee).toBeNull();
  });
  it("GATE-0 REGRESSION pure ranged via loading-only: 2014 heavy crossbow", () => {
    const hc = find(w2014, "crossbow, heavy"); // 2014 entity is NAMED "Crossbow, heavy"
    expect(hc.properties).not.toContain("ammunition"); // guards the discriminator premise
    expect(hc.properties).toContain("loading");
    expect(classifyWeaponRange(hc)).toEqual({
      melee: null, ranged: { normal: 100, long: 400, thrown: false },
    });
  });
  it("2024 heavy crossbow pure ranged (via ammunition)", () => {
    expect(classifyWeaponRange(find(w2024, "heavy crossbow")).melee).toBeNull();
  });
  it("slug exceptions: dart (both editions) + net (2014) are pure ranged", () => {
    expect(classifyWeaponRange(find(w2014, "dart")).melee).toBeNull();
    expect(classifyWeaponRange(find(w2024, "dart")).melee).toBeNull();
    expect(classifyWeaponRange(find(w2014, "net"))).toEqual({
      melee: null, ranged: { normal: 5, long: 15, thrown: false },
    });
  });
  it("natural/melee weapon with no range struct", () => {
    expect(classifyWeaponRange({ category: "natural", properties: [], range: undefined, slug: "x_weapon_claws" }))
      .toEqual({ melee: { reach: 5 }, ranged: null });
  });
  it("defensive: melee-category weapon WITH a range struct gets a thrown mode (synthetic)", () => {
    expect(classifyWeaponRange({ category: "simple-melee", properties: ["thrown"], range: { normal: 20, long: 60 }, slug: "hb_weapon_chakram" }))
      .toEqual({ melee: { reach: 5 }, ranged: { normal: 20, long: 60, thrown: true } });
  });
  it("conditional-property objects never match property checks", () => {
    expect(classifyWeaponRange({
      category: "martial-ranged",
      properties: [{ kind: "conditional", uid: "ammunition", note: "n" }],
      range: { normal: 30, long: 120 }, slug: "hb_weapon_thing",
    }).melee).not.toBeNull(); // object "ammunition" must NOT make it pure-ranged
  });
});
