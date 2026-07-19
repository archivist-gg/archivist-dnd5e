import { describe, it, expect } from "vitest";
import * as yaml from "js-yaml";
import { parsePC } from "../src/pc/pc.parser";

// Minimal valid character document (the CONTENTS of a ```pc fence). Only the
// fields characterSchema treats as required are set; everything else relies on
// its schema default. Callers override any top-level key (e.g. `equipment`).
function minimalCharacter(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "Schema Fixture",
    edition: "2024",
    ability_method: "manual",
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    equipment: [],
    state: { hp: { current: 10, max: 10, temp: 0 } },
    ...overrides,
  };
}

const toPcYaml = (ch: Record<string, unknown>): string => yaml.dump(ch);

describe("characterSchema · equipment overrides admit per-instance defense arrays", () => {
  it("parses equipment overrides.resist without failing the whole file", () => {
    const ch = minimalCharacter({ equipment: [{ item: "[[srd-2024_ring]]", overrides: { resist: ["fire"] } }] });
    const r = parsePC(toPcYaml(ch));
    expect(r.success).toBe(true);
  });

  it("keeps overrides.spell/spell_ability round-trip", () => {
    const ch = minimalCharacter({
      equipment: [{ item: "[[me_spell-scroll-3rd-level]]", overrides: { spell: "srd-2024_fireball", spell_ability: "int" } }],
    });
    const r = parsePC(toPcYaml(ch));
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.equipment[0].overrides).toMatchObject({ spell: "srd-2024_fireball", spell_ability: "int" });
  });
});
