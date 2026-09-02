import { describe, it, expect } from "vitest";
import { parseRace } from "@archivist-gg/dnd5e/race/race.parser";
import { parseClass } from "@archivist-gg/dnd5e/class/class.parser";
import { parseSubclass } from "@archivist-gg/dnd5e/subclass/subclass.parser";

/**
 * R4-G3a §10.2.1 · the race-trait `action_cost` → `action` alias, in the PARSER.
 *
 * The SRD bundle spells a race trait's action cost `action_cost`; the canonical feature key the
 * badge router (`featureEconomy`) reads is `action`. Both are declared by `feature-schema.ts`, so
 * the bundle's Breath Weapon parsed CLEAN and routed to `passive` anyway. The alias fills the hole
 * before `safeParse`; the declared key always wins and `action_cost` is never deleted.
 *
 * The fixture is the SRD 5e Dragonborn's Breath Weapon trait copied VERBATIM from
 * `.compendium-bundle/SRD 5e/Races/Dragonborn.md:105-116` (the plugin repo's shipped bundle) at its
 * `traits:` indentation. `String.raw` keeps the description's authored `\r\n` as the two literal
 * characters the bundle file holds rather than letting JS turn them into a real CR/LF before YAML
 * sees the double-quoted scalar.
 */
const breathWeaponTrait = String.raw`  - name: Breath Weapon
    description: "You can use your action to exhale destructive energy. Your draconic ancestry determines the size, shape, and damage type of the exhalation.\r\nWhen you use your breath weapon, each creature in the area of the exhalation must make a saving throw, the type of which is determined by your draconic ancestry. The DC for this saving throw equals 8 + your Constitution modifier + your proficiency bonus. A creature takes 2d6 damage on a failed save, and half as much damage on a successful one. The damage increases to 3d6 at 6th level, 4d6 at 11th level, and 5d6 at 16th level."
    action_cost: action
    save:
      ability: dex
      dc_formula: 8 + {con_mod} + {prof_bonus}
    id: breath-weapon
    resources:
      - id: dragonborn:breath-weapon
        name: Breath Weapon
        max_formula: '1'
        reset: short-rest
`;

/** The same trait one nesting level deeper, for the `features_by_level: { '1': [...] }` roots.
 *  The description is a single physical line, so a per-line re-indent is faithful. */
const indented = breathWeaponTrait
  .split("\n")
  .map((l) => (l ? `  ${l}` : l))
  .join("\n");

/** A trait that DECLARES `action` as well · the declared-wins fixture. */
const bothKeysTrait = `  - name: Both Keys\n    description: d\n    action: reaction\n    action_cost: action\n`;

// The 14 keys `raceEntitySchema` requires (`edition` is supplied by parseRace itself), ending on
// `traits:` so a trait block appends directly.
const baseRace = `name: Testling\nslug: test_race_testling\nsource: T\ndescription: d\nsize: medium\nspeed:\n  walk: 30\nability_score_increases: []\nage: a\nalignment: n\nvision: {}\nlanguages:\n  fixed: []\nvariant_label: Testling\ntraits:\n`;

// A minimal ACCEPTED class / subclass, both ending on `features_by_level:` so a level block
// appends directly (js-yaml throws on a duplicate mapping key, so the widening tests' bases,
// which already close `features_by_level: {}`, cannot be reused here).
const baseClass = `name: Bard\nslug: x_class_bard\nedition: "2024"\nsource: SRD 5.2\ndescription: An inspiring magical performer.\nhit_die: d8\nprimary_abilities: [cha]\nsaving_throws: [dex, cha]\nproficiencies:\n  armor: []\n  weapons: { categories: [simple] }\nskill_choices: { count: 3, from: [acrobatics, arcana, athletics] }\nstarting_equipment: []\nspellcasting: null\nsubclass_level: 3\nsubclass_feature_name: Bard College\nweapon_mastery: null\nepic_boon_level: null\ntable: {}\nresources: []\nfeatures_by_level:\n  '1':\n`;

const baseSubclass = `name: Testsub\nslug: test_subclass_testsub\nparent_class: '[[bard]]'\nsource: T\ndescription: d\nresources: []\nfeatures_by_level:\n  '1':\n`;

describe("§10.2.1 · race-trait action_cost aliases onto action (parseRace)", () => {
  it("the SRD 5e Dragonborn Breath Weapon trait parses with action SET and action_cost RETAINED", () => {
    const r = parseRace(baseRace + breathWeaponTrait);
    expect(r.success).toBe(true);
    if (!r.success) return;
    const trait = r.data.traits[0];
    expect(trait.name).toBe("Breath Weapon");
    expect(trait.action).toBe("action");                       // the alias wrote the canonical key
    expect(trait.action_cost).toBe("action");                  // …and never deleted the declared one
    // The Save line's source data rides through untouched (rendered as TEXT by the feature card).
    expect(trait.save).toEqual({ ability: "dex", dc_formula: "8 + {con_mod} + {prof_bonus}" });
  });

  it("a trait declaring BOTH keys keeps its declared action (declared wins, never an overwrite)", () => {
    const r = parseRace(baseRace + bothKeysTrait);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.traits[0].action).toBe("reaction");
    expect(r.data.traits[0].action_cost).toBe("action");
  });

  it("a trait with NEITHER key comes back without an action (the alias invents nothing)", () => {
    const r = parseRace(baseRace + `  - name: Plain\n    description: d\n`);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.traits[0].action).toBeUndefined();
  });
});

describe("§10.2.1 · the same alias over features_by_level (parseClass / parseSubclass)", () => {
  it("parseClass sets action on a level-1 feature carrying action_cost", () => {
    const r = parseClass(baseClass + indented);
    expect(r.success).toBe(true);
    if (!r.success) return;
    const f = r.data.features_by_level["1"][0];
    expect(f.name).toBe("Breath Weapon");
    expect(f.action).toBe("action");
    expect(f.action_cost).toBe("action");
  });

  it("parseSubclass sets action on a level-1 feature carrying action_cost", () => {
    const r = parseSubclass(baseSubclass + indented);
    expect(r.success).toBe(true);
    if (!r.success) return;
    const f = r.data.features_by_level["1"][0];
    expect(f.name).toBe("Breath Weapon");
    expect(f.action).toBe("action");
    expect(f.action_cost).toBe("action");
  });

  it("parseClass keeps a level-1 feature's DECLARED action", () => {
    const r = parseClass(baseClass + `    - name: Both Keys\n      description: d\n      action: reaction\n      action_cost: action\n`);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.features_by_level["1"][0].action).toBe("reaction");
  });
});

/**
 * §10.3 · ALL FIVE bundle carriers of a feature-level `action_cost`, pinned.
 *
 * These are the five rows spec §10.1 enumerates, and they are the entire live population of the
 * key: `action_cost` at feature level exists ONLY in the shipped compendium bundle, on race traits.
 * Each `block` below is the trait copied BYTE-VERBATIM out of the file named in `file` (the line
 * range is the slice taken), at its `traits:` indentation.
 *
 * Why copies and not the real files: this suite lives in the dnd5e package, which ships to npm and
 * does not contain `.compendium-bundle` at all. Reading it would need a hard-coded absolute path
 * into a sibling working copy, and NO dnd5e test reads outside its own repo (every file-reading
 * test resolves through `__dirname` into `src/`, `tools/` or `tests/fixtures/`). The in-repo
 * precedent for bundle data is `tests/race-schema-widening.test.ts:73-74`, which copies its blocks
 * verbatim and names the source file in a comment; this follows it. The REAL files are read, and
 * these same five rows asserted against them, by the plugin suite, which does hold the bundle:
 * `tests/srd-canonical/bundle-feature-action-cost.test.ts`.
 */
const BUNDLE_CARRIERS = [
  {
    file: "SRD 5e/Races/Half-Orc.md:54-62",
    trait: "Relentless Endurance",
    expected: "special",
    block: String.raw`  - name: Relentless Endurance
    description: When you are reduced to 0 hit points but not killed outright, you can drop to 1 hit point instead. You can't use this feature again until you finish a long rest.
    action_cost: special
    id: relentless-endurance
    resources:
      - id: half-orc:relentless-endurance
        name: Relentless Endurance
        max_formula: '1'
        reset: long-rest
`,
  },
  {
    file: "SRD 5e/Races/Dragonborn.md:105-116",
    trait: "Breath Weapon",
    expected: "action",
    block: String.raw`  - name: Breath Weapon
    description: "You can use your action to exhale destructive energy. Your draconic ancestry determines the size, shape, and damage type of the exhalation.\r\nWhen you use your breath weapon, each creature in the area of the exhalation must make a saving throw, the type of which is determined by your draconic ancestry. The DC for this saving throw equals 8 + your Constitution modifier + your proficiency bonus. A creature takes 2d6 damage on a failed save, and half as much damage on a successful one. The damage increases to 3d6 at 6th level, 4d6 at 11th level, and 5d6 at 16th level."
    action_cost: action
    save:
      ability: dex
      dc_formula: 8 + {con_mod} + {prof_bonus}
    id: breath-weapon
    resources:
      - id: dragonborn:breath-weapon
        name: Breath Weapon
        max_formula: '1'
        reset: short-rest
`,
  },
  {
    file: "SRD 2024/Races/Dwarf.md:38-49",
    trait: "Stonecunning",
    expected: "bonus-action",
    block: String.raw`  - name: Stonecunning
    description: |-
      As a Bonus Action, you gain Tremorsense with a range of 60 feet for 10 minutes. You must be on a stone surface or touching a stone surface to use this Tremorsense. The stone can be natural or worked.

      You can use this Bonus Action a number of times equal to your Proficiency Bonus, and you regain all expended uses when you finish a Long Rest.
    action_cost: bonus-action
    id: stonecunning
    resources:
      - id: dwarf:stonecunning
        name: Stonecunning
        max_formula: prof
        reset: long-rest
`,
  },
  {
    file: "SRD 2024/Races/Orc.md:32-43",
    trait: "Adrenaline Rush",
    expected: "bonus-action",
    block: String.raw`  - name: Adrenaline Rush
    description: |-
      You can take the Dash action as a Bonus Action. When you do so, you gain a number of Temporary Hit Points equal to your Proficiency Bonus.

      You can use this trait a number of times equal to your Proficiency Bonus, and you regain all expended uses when you finish a Short or Long Rest.
    action_cost: bonus-action
    id: adrenaline-rush
    resources:
      - id: orc:adrenaline-rush
        name: Adrenaline Rush
        max_formula: prof
        reset: short-rest
`,
  },
  {
    file: "SRD 2024/Races/Dragonborn.md:106-120",
    trait: "Breath Weapon",
    expected: "action",
    block: String.raw`  - name: Breath Weapon
    description: |-
      When you take the Attack action on your turn, you can replace one of your attacks with an exhalation of magical energy in either a 15-foot Cone or a 30-foot Line that is 5 feet wide (choose the shape each time). Each creature in that area must make a Dexterity saving throw (DC 8 plus your Constitution modifier and Proficiency Bonus). On a failed save, a creature takes 1d10 damage of the type determined by your Draconic Ancestry trait. On a successful save, a creature takes half as much damage. This damage increases by 1d10 when you reach character levels 5 (2d10), 11 (3d10), and 17 (4d10).

      You can use this Breath Weapon a number of times equal to your Proficiency Bonus, and you regain all expended uses when you finish a Long Rest.
    action_cost: action
    save:
      ability: dex
      dc_formula: 8 + {con_mod} + {prof_bonus}
    id: breath-weapon
    resources:
      - id: dragonborn:breath-weapon
        name: Breath Weapon
        max_formula: prof
        reset: long-rest
`,
  },
] as const;

describe("§10.3 · every bundle carrier of a feature-level action_cost aliases onto action", () => {
  it.each(BUNDLE_CARRIERS)("$file · $trait · action_cost $expected", ({ trait, expected, block }) => {
    const r = parseRace(baseRace + block);
    expect(r.success).toBe(true);
    if (!r.success) return;
    const t = r.data.traits.find((x) => x.name === trait);
    expect(t, `${trait} must be in the fixture`).toBeDefined();
    expect(t?.action).toBe(expected);          // the alias wrote the canonical key
    expect(t?.action_cost).toBe(expected);     // …and the declared one is retained
  });

  it("pins the POPULATION, so a sixth carrier cannot be added to the bundle without touching this list", () => {
    expect(BUNDLE_CARRIERS.length).toBe(5);
    expect(BUNDLE_CARRIERS.map((c) => c.expected).sort())
      .toEqual(["action", "action", "bonus-action", "bonus-action", "special"]);
  });
});
