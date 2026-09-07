import { describe, it, expect } from "vitest";
import { resolveMonster } from "../src/monster/monster.resolve";
import type { Monster } from "../src/monster/monster.types";
import {
  capitalizeWords, capitalizeOutsideLinks, formatSize, sizeWord, formatAlignment, alignmentWords, formatType,
  formatCR, challengeLine, crString, formatAC, formatHP, formatSpeed, speedNumber, formatQualifiers, qualifierStrings,
  formatInitiative, formatGear, formatSkillsOther, legendaryIntro, sectionHeader, displayAsSection,
} from "../src/monster/monster.format";

/** R4-G6 §6 · read-time decoding, tables as data. The SRD string arms must reproduce the plugin renderer's output
 *  byte for byte (invariant 5: the T3 sha pins are the corpus-wide proof; these are the unit witnesses). */
describe("the SRD string arms reproduce today's renderer (invariant 5)", () => {
  it("formatSize / formatType / formatAlignment title-case plain strings exactly like capitalizeWords", () => {
    expect(formatSize("large")).toBe("Large");
    expect(formatType("aberration")).toBe("Aberration");
    expect(formatAlignment("lawful evil")).toBe("Lawful Evil");
    expect(formatAlignment("any alignment")).toBe("Any Alignment");
    expect(formatAlignment("neutral good (50%) or neutral evil (50%)")).toBe("Neutral Good (50%) Or Neutral Evil (50%)");
  });
  it("formatAC on one {ac, from} entry", () => {
    expect(formatAC([{ ac: 17, from: ["natural armor"] }])).toBe("17 (Natural Armor)");
    expect(formatAC([])).toBe("10");
    expect(formatAC(undefined)).toBe("10");
  });
  it("formatSpeed on numbers, the empty object, and absent", () => {
    expect(formatSpeed({ walk: 10, swim: 40 })).toBe("Walk 10 ft., Swim 40 ft.");
    expect(formatSpeed({})).toBe("");
    expect(formatSpeed(undefined)).toBe("0 ft.");
  });
  it("formatQualifiers on strings", () => {
    expect(formatQualifiers(["deep speech; telepathy 120 ft."])).toEqual(["Deep Speech; Telepathy 120 Ft."]);
    expect(formatQualifiers(null)).toEqual([]);
  });
  it("crString is the bare cr", () => {
    expect(crString("10")).toBe("10");
    expect(crString(undefined)).toBeUndefined();
  });
});

describe("size (§6)", () => {
  it("decodes codes, joins arrays with ' or ', keeps a note", () => {
    expect(formatSize(["G"])).toBe("Gargantuan");
    expect(formatSize(["S", "M"])).toBe("Small or Medium");
    expect(formatSize(["T", "S", "M", "L", "H"])).toBe("Tiny, Small, Medium, Large, or Huge");
    expect(formatSize(["M"], "or smaller")).toBe("Medium or smaller");
  });
  it("sizeWord is the first decoded word, lower-cased", () => {
    expect(sizeWord(["G"])).toBe("gargantuan");
    expect(sizeWord("Medium")).toBe("medium");
    expect(sizeWord(undefined)).toBe("medium");
  });
});

describe("alignment (§6; the measured combos)", () => {
  it("decodes one and two codes", () => {
    expect(formatAlignment(["U"])).toBe("Unaligned");
    expect(formatAlignment(["A"])).toBe("Any Alignment");
    expect(formatAlignment(["N"])).toBe("Neutral");
    expect(formatAlignment(["C", "E"])).toBe("Chaotic Evil");
  });
  it("decodes the four large sets", () => {
    expect(formatAlignment(["L", "NX", "C", "NY", "E"])).toBe("Any Non-Good Alignment");
    expect(formatAlignment(["NX", "C", "G", "NY", "E"])).toBe("Any Non-Lawful Alignment");
    expect(formatAlignment(["L", "NX", "C", "E"])).toBe("Any Evil Alignment");
    expect(formatAlignment(["C", "G", "NY", "E"])).toBe("Any Chaotic Alignment");
  });
  it("decodes object entries: chance, special, note, and NX|NY|N through the object path", () => {
    expect(formatAlignment([{ alignment: ["N", "G"], chance: 50 }, { alignment: ["N", "E"], chance: 50 }])).toBe("Neutral Good (50%) Or Neutral Evil (50%)");
    expect(formatAlignment([{ special: "lawful grumpy" }])).toBe("Lawful Grumpy");
    expect(formatAlignment([{ alignment: ["C", "G"], note: "chaotic evil when fully possessed" }])).toBe("Chaotic Good (Chaotic Evil When Fully Possessed)");
    expect(formatAlignment([{ alignment: ["N"] }, { alignment: ["NX", "NY", "N"] }])).toBe("Neutral Or Any Neutral Alignment");
  });
  it("prepends the prefix verbatim (it already ends with a space) and never throws on an unmapped set", () => {
    expect(formatAlignment(["N", "E"], "typically ")).toBe("Typically Neutral Evil");
    expect(formatAlignment(["L", "G", "E"])).toBe("Lawful Good Evil");
  });
  it("alignmentWords lower-cases the decoded text", () => {
    expect(alignmentWords(["C", "E"])).toBe("chaotic evil");
    expect(alignmentWords("any non-good alignment")).toBe("any non-good alignment");
  });
});

describe("type (§6)", () => {
  it("renders tags, prefixes, choose, swarms and sidekicks", () => {
    expect(formatType({ type: "dragon", tags: ["chromatic"] })).toBe("Dragon (Chromatic)");
    expect(formatType({ type: "humanoid", tags: [{ tag: "elf", prefix: "Drow" }] })).toBe("Humanoid (Drow Elf)");
    expect(formatType({ type: "humanoid", tags: [{ tag: "elf", prefix: "Drow", prefix_hidden: true }] })).toBe("Humanoid (Elf)");
    expect(formatType({ type: { choose: ["celestial", "fiend"] } })).toBe("Celestial or Fiend");
    expect(formatType({ type: "aberration", swarm_size: "T" })).toBe("Swarm of Tiny Aberrations");
    expect(formatType({ type: "fey", swarm_size: "T" })).toBe("Swarm of Tiny Fey");
    expect(formatType({ type: "humanoid", tags: ["human"], sidekick_type: "spellcaster", sidekick_tags: ["mage"] }, 5)).toBe("Humanoid (Human), Spellcaster Sidekick (Mage) (level 5)");
    expect(formatType({ type: "humanoid", sidekick_type: "warrior", sidekick_hidden: true }, 3)).toBe("Humanoid");
  });
});

describe("challenge (§6; the four object shapes)", () => {
  it("a string cr", () => {
    expect(challengeLine("30")).toBe("30 (155,000 XP; PB +9)");
    expect(challengeLine("1/4")).toBe("1/4 (50 XP; PB +2)");
    expect(challengeLine("0")).toBe("0 (10 XP; PB +2)");
    expect(challengeLine("Unknown")).toBe("Unknown (PB +2)");
    expect(challengeLine(undefined)).toBeUndefined();
  });
  it("the four object shapes", () => {
    expect(challengeLine({ cr: "11", xp_lair: 8400 })).toBe("11 (7,200 XP, or 8,400 XP in its lair; PB +4)");
    expect(challengeLine({ cr: "22", lair: "23" })).toBe("22 (41,000 XP; PB +7), or 23 (50,000 XP) in its lair");
    expect(challengeLine({ cr: "5", coven: "7" })).toBe("5 (1,800 XP; PB +3), or 7 (2,900 XP) as a coven");
    expect(challengeLine({ cr: "3", xp: 6500 })).toBe("3 (6,500 XP; PB +2)");
  });
  it("pb_note replaces the PB text; crString narrows the object", () => {
    expect(challengeLine("5", "equals your Proficiency Bonus")).toBe("5 (1,800 XP; PB equals your Proficiency Bonus)");
    expect(crString({ cr: "11", xp_lair: 8400 })).toBe("11");
    expect(formatCR({ cr: "11", lair: "13" })?.pb).toBe(4);
  });
});

describe("armor class, hit points, speed (§6)", () => {
  it("formatAC renders every entry, braces, condition, special, and skips an empty entry", () => {
    expect(formatAC([{ ac: 23, from: ["natural armor"] }, { ac: 20, condition: "in humanoid form" }])).toBe("23 (Natural Armor), 20 in humanoid form");
    expect(formatAC([{ ac: 15 }, { ac: 17, braces: true, condition: "with mage armor" }])).toBe("15, (17 with mage armor)");
    expect(formatAC([{ special: "12 + your Intelligence modifier" }])).toBe("12 + your Intelligence modifier");
    expect(formatAC([{}, { ac: 12 }])).toBe("12");
  });
  it("formatAC title-cases the alias but never the wikilink target", () => {
    expect(formatAC([{ ac: 15, from: ["[[Player's Handbook (2014)/Magic Items/Chain Shirt|chain shirt]]"] }])).toBe("15 ([[Player's Handbook (2014)/Magic Items/Chain Shirt|Chain Shirt]])");
    expect(capitalizeOutsideLinks("natural armor, [[a/b's c|d e]] and shield")).toBe("Natural Armor, [[a/b's c|D E]] And Shield");
    expect(capitalizeWords("player's handbook")).toBe("Player'S Handbook");
  });
  it("formatHP", () => {
    expect(formatHP({ average: 574, formula: "28d20 + 280" })).toEqual({ text: "574", formula: "28d20 + 280" });
    expect(formatHP({ special: "58" })).toEqual({ text: "58" });
    expect(formatHP({})).toEqual({ text: "0" });
    expect(formatHP(undefined)).toEqual({ text: "0" });
  });
  it("formatSpeed handles object values, the mode list, can_hover, alternate and choose", () => {
    expect(formatSpeed({ walk: 60, fly: { number: 60, condition: "(hover)" }, swim: 60, can_hover: true })).toBe("Walk 60 ft., Fly 60 ft. (hover), Swim 60 ft.");
    expect(formatSpeed({ walk: 30, fly: 60, can_hover: true })).toBe("Walk 30 ft., Fly 60 ft. (hover)");
    expect(formatSpeed({ walk: 30, hover: true })).toBe("Walk 30 ft.");
    expect(formatSpeed({ walk: 30, alternate: { walk: [{ number: 40, condition: "(bear form only)" }] } })).toBe("Walk 30 ft., Walk 40 ft. (bear form only)");
    expect(formatSpeed({ walk: 30, choose: { from: ["climb", "fly"], amount: 20, note: "(DM's choice)" } })).toBe("Walk 30 ft., 20 ft. climb or fly (DM's choice)");
    expect(speedNumber({ fly: { number: 60, condition: "(hover)" } }, "fly")).toBe(60);
    expect(speedNumber({ walk: 30 }, "fly")).toBe(0);
  });
});

describe("qualifiers, initiative, gear, skills_other (§6)", () => {
  it("formatQualifiers renders objects and keeps strings", () => {
    expect(formatQualifiers(["acid", { types: ["bludgeoning", "piercing", "slashing"], note: "from nonmagical attacks", cond: true }])).toEqual(["Acid", "Bludgeoning, Piercing, Slashing from nonmagical attacks"]);
    expect(formatQualifiers([{ pre_note: "nonmagical", types: ["fire"] }])).toEqual(["nonmagical Fire"]);
    expect(formatQualifiers([{ special: "damage from spells" }])).toEqual(["damage from spells"]);
    expect(formatQualifiers([{ types: [{ types: ["slashing"], note: "from nonmagical attacks" }] }])).toEqual(["Slashing from nonmagical attacks"]);
    expect(qualifierStrings(["acid", { types: ["fire"] }])).toEqual(["acid"]);
  });
  it("formatInitiative", () => {
    const ab = { str: 24, dex: 25, con: 20, int: 19, wis: 23, cha: 22 };
    expect(formatInitiative({ proficiency: 2 }, ab, 6)).toBe("+19 (29)");
    expect(formatInitiative({ proficiency: 1 }, ab, 2)).toBe("+9 (19)");
    expect(formatInitiative({ advantage_mode: "advantage" }, ab, 2)).toBe("+7 (17) (advantage)");
    expect(formatInitiative({ advantage_mode: "adv" }, ab, 2)).toBe("+7 (17) (advantage)");
    expect(formatInitiative(0, ab, 2)).toBe("+0 (10)");
    expect(formatInitiative(undefined, ab, 2)).toBeUndefined();
  });
  it("formatGear and formatSkillsOther", () => {
    expect(formatGear(["breastplate|xphb", { item: "javelin|xphb", quantity: 5 }, { item: "longsword|phb", displayName: "Gossamer (+1 Longsword)" }])).toBe("Breastplate, Javelin × 5, Gossamer (+1 Longsword)");
    expect(formatSkillsOther([{ one_of: { arcana: "+7", history: "+7" } }])).toBe("plus one of: Arcana +7, History +7");
    expect(formatSkillsOther(undefined)).toBeUndefined();
  });
});

describe("legendary intro, section headers, displayAs (§6)", () => {
  it("legendaryIntro subjects", () => {
    expect(legendaryIntro({ name: "Aspect of Tiamat" }, 3)).toBe("The aspect of tiamat can take 3 legendary actions, choosing from the options below. Only one legendary action option can be used at a time and only at the end of another creature's turn. The aspect of tiamat regains spent legendary actions at the start of its turn.");
    expect(legendaryIntro({ name: "Zariel", is_named_creature: true }, 3)).toMatch(/^Zariel can take 3 legendary actions/);
    expect(legendaryIntro({ name: "Tyreus, Illusionist", is_named_creature: true, short_name: "Tyreus" }, 3)).toMatch(/^Tyreus can take 3/);
    expect(legendaryIntro({ name: "Zariel", is_named_creature: true, short_name: true }, 3)).toMatch(/^Zariel can take 3/);
    expect(legendaryIntro({ name: "Dragon", legendary_actions_lair_count: 4 }, 3)).toMatch(/can take 3 legendary actions \(4 in its lair\)/);
  });
  it("sectionHeader prefers section_headers, falls back to mythic_header for mythic", () => {
    expect(sectionHeader({ section_headers: [{ section: "mythic", header: ["If the trait activated..."] }] }, "mythic")).toEqual(["If the trait activated..."]);
    expect(sectionHeader({ mythic_header: ["Fallback"] }, "mythic")).toEqual(["Fallback"]);
    expect(sectionHeader({ mythic_header: ["Fallback"] }, "reactions")).toBeUndefined();
  });
  it("displayAsSection maps the four values and defaults to traits", () => {
    expect(displayAsSection("action")).toBe("actions");
    expect(displayAsSection("bonus")).toBe("bonus_actions");
    expect(displayAsSection("reaction")).toBe("reactions");
    expect(displayAsSection("legendary")).toBe("legendary_actions");
    expect(displayAsSection(undefined)).toBe("traits");
    expect(displayAsSection("traits")).toBe("traits");
  });
});

describe("resolveMonster keeps the authored cr (spec §6 / §13 row 52: the LOOKUPS narrow, the field never)", () => {
  it("an object cr drives the two enrichment lookups and survives in the output", () => {
    const raw = { name: "Vampire Infernalist", cr: { cr: "14", xp_lair: 13000 } };
    // `MonsterRaw = Monster` and `Monster.cr` stays `string` until T4: the cast keeps per-file tsc at 0 (spec §12.2 / C7-M-3)
    const r = resolveMonster(raw as unknown as Monster, { lookup: () => undefined });
    expect(r.proficiency_bonus).toBe(5);        // RED first at the T2 base (2: today's narrowing maps an object to "0")
    expect(r.xp).toBe(11500);
    expect(r.cr).toEqual({ cr: "14", xp_lair: 13000 });
  });
});
