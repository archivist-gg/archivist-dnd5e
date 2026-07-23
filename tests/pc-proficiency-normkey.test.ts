// tests/pc-proficiency-normkey.test.ts

import { describe, it, expect } from "vitest";
import { normKey } from "../src/pc/pc.proficiency-normalize";
import weapon2014 from "../src/srd/data/runtime/weapon.2014.json";
import weapon2024 from "../src/srd/data/runtime/weapon.2024.json";

const byEdition: Record<string, Array<{ name: string }>> = {
  "2014": weapon2014 as Array<{ name: string }>,
  "2024": weapon2024 as Array<{ name: string }>,
};
const loadWeaponNames = (ed: string): string[] => byEdition[ed].map((w) => w.name);

describe("normKey", () => {
  it("matches class display names to weapon entity names", () => {
    expect(normKey("hand crossbows")).toBe(normKey("Crossbow, hand"));
    expect(normKey("light crossbows")).toBe(normKey("Crossbow, light"));
    expect(normKey("rapiers")).toBe(normKey("Rapier"));
    expect(normKey("quarterstaffs")).toBe(normKey("Quarterstaff"));
  });
  it("does not match unrelated weapons", () => {
    expect(normKey("rapiers")).not.toBe(normKey("Longsword"));
  });
  it("filters empty tokens from punctuation runs", () => {
    expect(normKey("Crossbow, hand")).toBe("crossbow hand");
  });
});

describe("normKey full-set guarantees", () => {
  it("normKey is collision-free across the full weapon set (both editions)", () => {
    for (const ed of ["2014", "2024"]) {
      const names = loadWeaponNames(ed);
      const keys = names.map(normKey);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
  it("every 2014-class fixed weapon resolves cross-edition", () => {
    const classFixed = ["hand crossbows", "light crossbows", "rapiers", "longswords", "shortswords",
      "clubs", "daggers", "darts", "javelins", "maces", "quarterstaffs", "scimitars", "sickles", "slings", "spears"];
    for (const ed of ["2014", "2024"]) {
      const byKey = new Map(loadWeaponNames(ed).map((n) => [normKey(n), n]));
      for (const f of classFixed) expect(byKey.has(normKey(f))).toBe(true);
    }
  });
});
