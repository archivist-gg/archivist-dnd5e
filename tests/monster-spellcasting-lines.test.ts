import { describe, it, expect } from "vitest";
import { SPELLCASTING_LABELS, spellcastingLines } from "../src/monster/monster.format";

/** R4-G6 §8.2 · the lines of a spellcasting entry. Labels from ONE table (title-cased like the SRD 2024 prose the vault
 *  already shows); groups in the 5etools order; sub-keys DESCENDING with the plain key BEFORE its `e` twin; `hidden`
 *  omits a frequency group OR the slot table; spells join with ", ". */
describe("spellcastingLines", () => {
  it("header, will, daily descending with the plain key before its e twin, slots ascending, footer", () => {
    const lines = spellcastingLines({
      name: "Spellcasting", ability: "cha",
      headerEntries: ["The vampire casts one of the following spells."],
      will: ["[[a|Detect Thoughts]]", "[[b|Command]]"],
      daily: { "1e": ["[[c|Dominate Person]]"], "2": ["[[d|Fear]]"], "2e": ["[[e|Scrying]]"] },
      spells: { "0": { spells: ["[[f|Mage Hand]]"] }, "1": { slots: 4, spells: ["[[g|Shield]]"] }, "3": { slots: 2, lower: 1, spells: ["[[h|Fireball]]"] } },
      footerEntries: ["*New spell."],
    });
    expect(lines).toEqual([
      "The vampire casts one of the following spells.",
      "At Will: [[a|Detect Thoughts]], [[b|Command]]",
      "2/Day: [[d|Fear]]",
      "2/Day Each: [[e|Scrying]]",
      "1/Day Each: [[c|Dominate Person]]",
      "Cantrips (At Will): [[f|Mage Hand]]",
      "1st Level (4 Slots): [[g|Shield]]",
      "3rd Level (2 1st-Level Slots): [[h|Fireball]]",
      "*New spell.",
    ]);
  });
  it("every group label", () => {
    const lines = spellcastingLines({
      rest: { "1e": ["a"] }, restLong: { "1": ["b"] }, recharge: { "5": ["c"], "6": ["d"] }, legendary: { "1e": ["e"] },
      charges: { "2e": ["f"] }, chargesItem: "wand of orcus|dmg", ritual: ["g"],
    });
    expect(lines).toEqual([
      "1/Rest Each: a", "1/Long Rest: b", "Recharge 6: d", "Recharge 5-6: c", "1/Legendary Action Each: e",
      "2 Charges Each (wand of orcus|dmg): f", "Rituals: g",
    ]);
  });
  it("hidden omits a frequency group, the slot table, and a hidden entry", () => {
    expect(spellcastingLines({ headerEntries: ["h"], hidden: ["will"], will: ["x"], daily: { "1e": ["y"] } })).toEqual(["h", "1/Day Each: y"]);
    expect(spellcastingLines({ headerEntries: ["h"], hidden: ["spells"], spells: { "0": { spells: ["x"] } } })).toEqual(["h"]);
    expect(spellcastingLines({ will: ["a", { entry: "b", hidden: true }, { entry: "c" }] })).toEqual(["At Will: a, c"]);
  });
  it("every group of the render order owns a row in the ONE label table", () => {
    expect(Object.keys(SPELLCASTING_LABELS).sort()).toEqual(["charges", "daily", "legendary", "recharge", "rest", "restLong", "ritual", "will"]);
  });
  it("ordinals", () => {
    const lines = spellcastingLines({ spells: { "1": { slots: 1, spells: ["a"] }, "2": { slots: 1, spells: ["b"] }, "4": { slots: 1, spells: ["c"] }, "9": { slots: 1, spells: ["d"] } } });
    expect(lines.map((l) => l.split(" (")[0])).toEqual(["1st Level", "2nd Level", "4th Level", "9th Level"]);
  });
});
