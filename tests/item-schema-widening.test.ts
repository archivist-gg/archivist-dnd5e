import { describe, it, expect } from "vitest";
import { parseItem } from "@archivist-gg/dnd5e/item/item.parser";

/**
 * R4-G2 Task 2 · spec §4 — the item unions, the 14 nested keys and the modelled top-level keys.
 *
 * ⚠️ ASSERTION FORM (Gate 2 I-4). `itemEntitySchema` is a plain `z.object`: under zod v4 an
 * undeclared NESTED key is STRIPPED, not refused. So a bare `expect(r.success).toBe(true)` is
 * GREEN pre-fix for every nested case and proves nothing. Every nested-key and widened-arm case
 * below therefore asserts PRESENCE-WITH-VALUE on the parsed OUTPUT. Only the union/enum cases
 * (the light ARRAY arm, the focus ARRAY arm, the five NEW attunement arms) actually REFUSE pre-fix.
 *
 * Every literal is MEASURED against converter tree `744b2b85…` (6,046 item docs) unless labelled
 * a defensive or authored fixture; the counts in the test names are that measurement.
 */

const base = "name: Testitem\n";
/** The parsed entity as a bag — `Item` is an interface with no index signature, so a SINGLE cast
 *  is TS2352 (Gate 2 B-1). This keeps every presence-with-value assertion tsc-clean. */
const bag = (d: unknown): Record<string, unknown> => d as unknown as Record<string, unknown>;

describe("§4 light — the two arms, pinned by KEY-SET, never unified", () => {
  it("array key-set {dim} is ACCEPTED with the value intact (76 of 97 measured entries)", () => {
    const r = parseItem(base + "light: [{dim: 5}]\n");
    expect(r.success).toBe(true);
    if (r.success) expect(bag(r.data).light).toEqual([{ dim: 5 }]);
  });

  it("array key-set {bright,dim,shape} is ACCEPTED with all three values intact (3 entries)", () => {
    const r = parseItem(base + "light: [{bright: 60, dim: 120, shape: cone}]\n");
    expect(r.success).toBe(true);
    if (r.success) expect(bag(r.data).light).toEqual([{ bright: 60, dim: 120, shape: "cone" }]);
  });

  it("TWO entries — {bright,dim} then {dim} — both survive in order (17 + 76 entries; Hooded Lantern)", () => {
    const r = parseItem(base + "light: [{bright: 30, dim: 60}, {dim: 5}]\n");
    expect(r.success).toBe(true);
    if (r.success) expect(bag(r.data).light).toEqual([{ bright: 30, dim: 60 }, { dim: 5 }]);
  });

  it("array key-set {bright,shape} is ACCEPTED — dim ABSENT, not defaulted (1 entry)", () => {
    const r = parseItem(base + "light: [{bright: 20, shape: cone}]\n");
    expect(r.success).toBe(true);
    if (r.success) {
      expect(bag(r.data).light).toEqual([{ bright: 20, shape: "cone" }]);
      expect((bag(r.data).light as Array<Record<string, unknown>>)[0].dim).toBeUndefined();
    }
  });

  it("CONTROL (green BOTH sides) · the OBJECT arm keeps its OWN spelling {bright_radius,dim_radius} (173 carriers)", () => {
    const r = parseItem(base + "light: {bright_radius: 30, dim_radius: 60}\n");
    expect(r.success).toBe(true);
    if (r.success) expect(bag(r.data).light).toEqual({ bright_radius: 30, dim_radius: 60 });
  });

  it("the two spellings stay DISTINCT — an array entry never grows bright_radius, an object never grows bright", () => {
    const arr = parseItem(base + "light: [{bright: 60, dim: 120}]\n");
    const obj = parseItem(base + "light: {bright_radius: 30, dim_radius: 60}\n");
    expect(arr.success && obj.success).toBe(true);
    if (arr.success && obj.success) {
      expect(Object.keys((bag(arr.data).light as Array<object>)[0]).sort()).toEqual(["bright", "dim"]);
      expect(Object.keys(bag(obj.data).light as object).sort()).toEqual(["bright_radius", "dim_radius"]);
    }
  });
});

describe("§4 focus — the array arm joins boolean|string", () => {
  it("the ARRAY arm is ACCEPTED with both entries intact (54 docs)", () => {
    const r = parseItem(base + "focus: [Druid, Ranger]\n");
    expect(r.success).toBe(true);
    if (r.success) expect(bag(r.data).focus).toEqual(["Druid", "Ranger"]);
  });

  it("CONTROL (green BOTH sides) · the string arm still parses (26 docs) and the boolean arm too (2)", () => {
    const s = parseItem(base + "focus: arcane\n");
    const b = parseItem(base + "focus: true\n");
    expect(s.success && b.success).toBe(true);
    if (s.success) expect(bag(s.data).focus).toBe("arcane");
    if (b.success) expect(bag(b.data).focus).toBe(true);
  });
});

/** tags[] leaf shapes, all MEASURED: class string 291 · spellcasting boolean 65 · race string 38 ·
 *  alignment array<string> 29 (ZERO bare strings — the wider union arm is kept deliberately) ·
 *  creature_type string 10 · background string 10 · psionics boolean 2 · int number 1 ·
 *  skill_proficiency array<string> 1 · language_proficiency array<string> 1 · size string 1. */
describe("§4 attunement.tags[] — five NEW arms (refusals pre-fix)", () => {
  const tagged = (tag: string) => parseItem(base + "attunement:\n  required: true\n  tags:\n" + tag);

  it("{background} — the GGtR Azorius Keyrune literal (10 leaves)", () => {
    const r = tagged("    - {background: 'Azorius Functionary|GGR'}\n");
    expect(r.success).toBe(true);
    if (r.success) expect(bag(r.data).attunement).toEqual({
      required: true, tags: [{ background: "Azorius Functionary|GGR" }],
    });
  });

  it("{psionics} — Greater Silver Sword (2 leaves)", () => {
    const r = tagged("    - {psionics: true}\n");
    expect(r.success).toBe(true);
    if (r.success) expect(bag(r.data).attunement).toEqual({ required: true, tags: [{ psionics: true }] });
  });

  it("{int} — the Psi Crystal literal, the census-terminal first cause on 80 docs (1 leaf)", () => {
    const r = tagged("    - {int: 3}\n");
    expect(r.success).toBe(true);
    if (r.success) expect(bag(r.data).attunement).toEqual({ required: true, tags: [{ int: 3 }] });
  });

  it("{skill_proficiency} — Black Crystal Tablet (1 leaf)", () => {
    const r = tagged("    - {skill_proficiency: [arcana]}\n");
    expect(r.success).toBe(true);
    if (r.success) expect(bag(r.data).attunement).toEqual({
      required: true, tags: [{ skill_proficiency: ["arcana"] }],
    });
  });

  it("{language_proficiency} — Helm of Devil Command carries ['infernal']; ['draconic'] is the brief's literal (1 leaf)", () => {
    const r = tagged("    - {language_proficiency: [draconic]}\n");
    expect(r.success).toBe(true);
    if (r.success) expect(bag(r.data).attunement).toEqual({
      required: true, tags: [{ language_proficiency: ["draconic"] }],
    });
  });
});

describe("§4 attunement.tags[] — four WIDENED arms (silent STRIPS pre-fix, never refusals)", () => {
  const tagged = (tag: string) => parseItem(base + "attunement:\n  required: true\n  tags:\n" + tag);
  const tags = (d: unknown) => (bag(d).attunement as { tags: Array<Record<string, unknown>> }).tags;

  it("class arm keeps alignment (5 leaves — first-match strips it today)", () => {
    const r = tagged("    - {class: cleric, alignment: [L, G]}\n");
    expect(r.success).toBe(true);
    if (r.success) expect(tags(r.data)[0]).toEqual({ class: "cleric", alignment: ["L", "G"] });
  });

  it("alignment arm keeps race (3 leaves)", () => {
    const r = tagged("    - {alignment: [C, E], race: elf}\n");
    expect(r.success).toBe(true);
    if (r.success) expect(tags(r.data)[0]).toEqual({ alignment: ["C", "E"], race: "elf" });
  });

  it("race arm keeps alignment — the same two keys with race written first", () => {
    const r = tagged("    - {race: elf, alignment: [G]}\n");
    expect(r.success).toBe(true);
    if (r.success) expect(tags(r.data)[0]).toEqual({ race: "elf", alignment: ["G"] });
  });

  it("creature_type arm keeps size — the Propeller Helm's 'S' (1 leaf; size is a STRING, measured)", () => {
    const r = tagged("    - {creature_type: humanoid, size: S}\n");
    expect(r.success).toBe(true);
    if (r.success) expect(tags(r.data)[0]).toEqual({ creature_type: "humanoid", size: "S" });
  });

  it("CONTROL (green BOTH sides) · the untouched arms — bare class, bare alignment, spellcasting", () => {
    const r = tagged("    - {class: cleric, subclass: life}\n    - {alignment: [E]}\n    - {spellcasting: true}\n");
    expect(r.success).toBe(true);
    if (r.success) expect(tags(r.data)).toEqual([
      { class: "cleric", subclass: "life" }, { alignment: ["E"] }, { spellcasting: true },
    ]);
  });
});

describe("§4 nested keys — all silent STRIPS pre-fix", () => {
  it("charges.dice survives beside max (68 carriers)", () => {
    const r = parseItem(base + "charges:\n  max: 3\n  dice: '1d4 - 1'\n  recharge: dawn\n");
    expect(r.success).toBe(true);
    if (r.success) expect(bag(r.data).charges).toEqual({ max: 3, dice: "1d4 - 1", recharge: "dawn" });
  });

  it("container.capacity {volume} survives (8 of 31 carriers)", () => {
    const r = parseItem(base + "container:\n  capacity:\n    volume: [4]\n");
    expect(r.success).toBe(true);
    if (r.success) expect(bag(r.data).container).toEqual({ capacity: { volume: [4] } });
  });

  it("container.capacity {weight,weightless} and {item} survive; capacity_weight is untouched beside it", () => {
    const r = parseItem(base +
      "container:\n  capacity_weight: 6\n  capacity:\n    weight: [6]\n    weightless: true\n" +
      "    item:\n      - {'sling bullet|xphb': 20, 'needle|xphb': 50}\n");
    expect(r.success).toBe(true);
    if (r.success) expect(bag(r.data).container).toEqual({
      capacity_weight: 6,
      capacity: { weight: [6], weightless: true, item: [{ "sling bullet|xphb": 20, "needle|xphb": 50 }] },
    });
  });

  it("the four new bonuses scalars survive (spell_damage 24 · ability_check 3 · proficiency_bonus 2 · saving_throw_concentration 1)", () => {
    const r = parseItem(base +
      "bonuses:\n  spell_damage: 2\n  ability_check: 1\n  proficiency_bonus: 1\n  saving_throw_concentration: 1\n  ac: 1\n");
    expect(r.success).toBe(true);
    if (r.success) expect(bag(r.data).bonuses).toEqual({
      spell_damage: 2, ability_check: 1, proficiency_bonus: 1, saving_throw_concentration: 1, ac: 1,
    });
  });

  it("a new bonuses scalar also accepts the CONDITIONAL arm (numberOrConditional, not a bare number)", () => {
    const r = parseItem(base +
      "bonuses:\n  spell_damage:\n    value: 2\n    when:\n      - {kind: underwater}\n");
    expect(r.success).toBe(true);
    if (r.success) expect(bag(r.data).bonuses).toEqual({
      spell_damage: { value: 2, when: [{ kind: "underwater" }] },
    });
  });

  it("bonuses.ability_scores.choose WITHOUT amount — the Kwalish Deck of Several Things literal (amount is OPTIONAL)", () => {
    const r = parseItem(base +
      "bonuses:\n  ability_scores:\n    choose:\n      - from: [str, dex, con, int, wis, cha]\n        count: 1\n");
    expect(r.success).toBe(true);
    if (r.success) expect(bag(r.data).bonuses).toEqual({
      ability_scores: { choose: [{ from: ["str", "dex", "con", "int", "wis", "cha"], count: 1 }] },
    });
  });

  it("bonuses.ability_scores.choose WITH amount also survives (5 of the 6 measured leaves), beside static", () => {
    const r = parseItem(base +
      "bonuses:\n  ability_scores:\n    static: {con: 19}\n    choose:\n      - from: [str, dex]\n        count: 1\n        amount: 2\n");
    expect(r.success).toBe(true);
    if (r.success) expect(bag(r.data).bonuses).toEqual({
      ability_scores: { static: { con: 19 }, choose: [{ from: ["str", "dex"], count: 1, amount: 2 }] },
    });
  });

  it("attached_spells other/ability/ritual survive beside the declared will (18 · 10 · 1)", () => {
    const r = parseItem(base +
      "attached_spells:\n  will: [light]\n  other: ['fireball', 'ice storm']\n  ability: int\n  ritual: [identify]\n");
    expect(r.success).toBe(true);
    if (r.success) expect(bag(r.data).attached_spells).toEqual({
      will: ["light"], other: ["fireball", "ice storm"], ability: "int", ritual: ["identify"],
    });
  });
});

describe("§4 modelled top-level keys — the schema AND the KNOWN_KEYS gate are independent", () => {
  it("modify_speed {equal} is declared, keeps its value, and is NOT raw-bagged (101 of 124 carriers)", () => {
    const r = parseItem(base + "modify_speed:\n  equal: {fly: walk}\n");
    expect(r.success).toBe(true);
    if (r.success) {
      expect(bag(r.data).modify_speed).toEqual({ equal: { fly: "walk" } });
      expect(bag(r.data).raw).toBeUndefined();   // KNOWN_KEYS: the second, independent gate
    }
  });

  it("modify_speed static/multiply/bonus survive too (20 · 3 · 1; bonus is keyed '*')", () => {
    const r = parseItem(base +
      "modify_speed:\n  static: {walk: 30}\n  multiply: {swim: 2}\n  bonus: {'*': 10}\n");
    expect(r.success).toBe(true);
    if (r.success) expect(bag(r.data).modify_speed).toEqual({
      static: { walk: 30 }, multiply: { swim: 2 }, bonus: { "*": 10 },
    });
  });

  it("rendering_hint survives as the EMPTY STRING it actually carries and is NOT raw-bagged (6,046 carriers; .min(1) is forbidden)", () => {
    const r = parseItem(base + "rendering_hint: ''\n");
    expect(r.success).toBe(true);
    if (r.success) {
      expect(bag(r.data).rendering_hint).toBe("");
      expect(bag(r.data).raw).toBeUndefined();
    }
  });

  it("has_fluff / has_fluff_images survive with FALSE intact and are NOT raw-bagged (23 · 822)", () => {
    const r = parseItem(base + "has_fluff: true\nhas_fluff_images: false\n");
    expect(r.success).toBe(true);
    if (r.success) {
      expect(bag(r.data).has_fluff).toBe(true);
      expect(bag(r.data).has_fluff_images).toBe(false);
      expect(bag(r.data).raw).toBeUndefined();
    }
  });

  it("image accepts BOTH arms — one wikilink and an array — and is NOT raw-bagged (0 carriers today; images-ON emit)", () => {
    const one = parseItem(base + "image: '[[SRD 2024/Images/Items/A.webp]]'\n");
    const many = parseItem(base + "image:\n  - '[[SRD 2024/Images/Items/A.webp]]'\n  - '[[SRD 2024/Images/Items/B.webp]]'\n");
    expect(one.success && many.success).toBe(true);
    if (one.success) {
      expect(bag(one.data).image).toBe("[[SRD 2024/Images/Items/A.webp]]");
      expect(bag(one.data).raw).toBeUndefined();
    }
    if (many.success) expect(bag(many.data).image).toEqual([
      "[[SRD 2024/Images/Items/A.webp]]", "[[SRD 2024/Images/Items/B.webp]]",
    ]);
  });

  it("CONTROL · an UNDECLARED top-level key still lands in raw (the raw-bag itself is not disabled)", () => {
    const r = parseItem(base + "veh_speed: 12\n");
    expect(r.success).toBe(true);
    if (r.success) expect((bag(r.data).raw as Record<string, unknown>).veh_speed).toBe(12);
  });
});
