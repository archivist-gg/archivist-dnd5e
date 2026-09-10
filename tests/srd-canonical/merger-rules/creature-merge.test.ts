import { describe, it, expect, vi } from "vitest";
import { toCreatureCanonical, creatureMergeRule, isPlaceholderBonusBlock } from "../../../tools/srd-canonical/merger-rules/creature-merge";
import type { CanonicalEntry } from "../../../tools/srd-canonical/merger";

// Aboleth shape, modeled on real Open5e v2 (2024) data — primary damage in
// damage_*; the SRD 2024 cache often puts primary in extra_damage_* but for
// readability the canonical attack-shape test uses the plan's clean primary form.
const aboleth2024: Record<string, unknown> = {
  key: "srd_aboleth",
  name: "Aboleth",
  document: { name: "SRD 5.2", key: "srd-2024" },
  size: { name: "Large", key: "large" },
  type: { name: "Aberration", key: "aberration" },
  alignment: "lawful evil",
  armor_class: 17,
  armor_detail: "natural armor",
  hit_points: 150,
  hit_dice: "20d10+40",
  challenge_rating: 10,
  passive_perception: 20,
  ability_scores: { strength: 21, dexterity: 9, constitution: 15, intelligence: 18, wisdom: 15, charisma: 18 },
  modifiers: { strength: 5, dexterity: -1, constitution: 2, intelligence: 4, wisdom: 2, charisma: 4 },
  saving_throws: { constitution: 6, intelligence: 8, wisdom: 6 },
  skill_bonuses: { history: 12, perception: 10 },
  speed: { walk: 10, swim: 40, fly: 0, climb: 0, burrow: 0, unit: "feet" },
  darkvision_range: 120,
  blindsight_range: null,
  truesight_range: null,
  tremorsense_range: null,
  normal_sight_range: 20,
  languages: { as_string: "Deep Speech, telepathy 120 ft.", data: [] },
  resistances_and_immunities: {
    damage_immunities: [],
    damage_resistances: [],
    damage_vulnerabilities: [],
    condition_immunities: [],
  },
  actions: [
    {
      name: "Tail",
      desc: "Melee Weapon Attack: +9 to hit, reach 10 ft.",
      action_type: "ACTION",
      legendary_action_cost: 0,
      attacks: [{
        name: "Tail attack",
        attack_type: "WEAPON",
        to_hit_mod: 9,
        reach: 10,
        range: null,
        long_range: null,
        target_creature_only: false,
        damage_die_count: 3,
        damage_die_type: "D6",
        damage_bonus: 5,
        damage_type: { name: "Bludgeoning", key: "bludgeoning" },
        extra_damage_die_count: null,
        extra_damage_die_type: null,
        extra_damage_bonus: null,
        extra_damage_type: null,
        distance_unit: "feet",
      }],
    },
    {
      name: "Some Reaction",
      desc: "...",
      action_type: "REACTION",
      legendary_action_cost: 0,
      attacks: [],
    },
    {
      name: "Tail Swipe",
      desc: "The aboleth makes one tail attack.",
      action_type: "LEGENDARY_ACTION",
      legendary_action_cost: 1,
      attacks: [],
    },
  ],
  traits: [
    { name: "Amphibious", desc: "The aboleth can breathe air and water." },
    { name: "Legendary Resistance (3/Day)", desc: "If the aboleth fails a save, it can choose to succeed instead." },
  ],
  subcategory: null,
};

function buildEntry(base: Record<string, unknown>, edition: "2014" | "2024" = "2024"): CanonicalEntry {
  return {
    slug: `srd-${edition}_${(base.name as string).toLowerCase().replace(/\s+/g, "-")}`,
    edition,
    kind: "creature",
    base: base as never,
    structured: null,
    activation: null,
    overlay: null,
  };
}

describe("creature-merge field paths and structured attacks (β+)", () => {
  it("reads armor_class + armor_detail to ac:[{ac, from}]", () => {
    const result = toCreatureCanonical(buildEntry(aboleth2024));
    expect(result.ac).toEqual([{ ac: 17, from: ["natural armor"] }]);
  });

  it("reads hit_points + hit_dice", () => {
    const result = toCreatureCanonical(buildEntry(aboleth2024));
    expect(result.hp).toEqual({ average: 150, formula: "20d10+40" });
  });

  it("reads ability_scores with full names → short keys", () => {
    const result = toCreatureCanonical(buildEntry(aboleth2024));
    expect(result.abilities).toEqual({ str: 21, dex: 9, con: 15, int: 18, wis: 15, cha: 18 });
  });

  it("reads challenge_rating to cr (string)", () => {
    const result = toCreatureCanonical(buildEntry(aboleth2024));
    expect(result.cr).toBe("10");
  });

  it("composes senses string array from numeric range fields (spatial senses only)", () => {
    const result = toCreatureCanonical(buildEntry(aboleth2024));
    expect(result.senses).toContain("darkvision 120 ft.");
  });

  it("excludes passive Perception from senses array (top-level field is the source of truth)", () => {
    const result = toCreatureCanonical(buildEntry(aboleth2024));
    expect(result.senses).not.toContain(expect.stringMatching(/passive perception/i));
    expect(result.passive_perception).toBe(20);
  });

  it("normalizes size/type from object {name,key} to string", () => {
    const result = toCreatureCanonical(buildEntry(aboleth2024));
    expect(typeof result.size).toBe("string");
    expect(result.size.toLowerCase()).toBe("large");
    expect(typeof result.type).toBe("string");
    expect(result.type.toLowerCase()).toBe("aberration");
  });

  it("speed only emits modes with value > 0", () => {
    const result = toCreatureCanonical(buildEntry(aboleth2024));
    expect(result.speed.walk).toBe(10);
    expect(result.speed.swim).toBe(40);
    expect(result.speed.fly).toBeUndefined();
    expect(result.speed.climb).toBeUndefined();
    expect(result.speed.burrow).toBeUndefined();
  });

  it("languages.as_string parsed to string array", () => {
    const result = toCreatureCanonical(buildEntry(aboleth2024));
    expect(Array.isArray(result.languages)).toBe(true);
    expect(result.languages).toContain("Deep Speech");
    expect(result.languages).toContain("telepathy 120 ft.");
  });

  it("saves uses short ability keys", () => {
    const result = toCreatureCanonical(buildEntry(aboleth2024));
    expect(result.saves).toEqual({ con: 6, int: 8, wis: 6 });
  });

  it("splits actions[] by action_type into actions/reactions/legendary buckets", () => {
    const result = toCreatureCanonical(buildEntry(aboleth2024));
    expect(result.actions!.find(a => a.name === "Tail")).toBeDefined();
    expect(result.actions!.find(a => a.name === "Some Reaction")).toBeUndefined();
    expect(result.reactions!.find(a => a.name === "Some Reaction")).toBeDefined();
    expect(result.legendary_actions!.find(a => a.name === "Tail Swipe")).toBeDefined();
  });

  it("emits structured Feature.attacks for actions with attacks[]", () => {
    const result = toCreatureCanonical(buildEntry(aboleth2024));
    const tail = result.actions!.find(a => a.name === "Tail")!;
    expect(tail.attacks).toBeDefined();
    expect(tail.attacks!.length).toBe(1);
    expect(tail.attacks![0].bonus).toBe(9);
    expect(tail.attacks![0].damage).toBe("3d6+5");
    expect(tail.attacks![0].damage_type).toBe("bludgeoning");
    expect(tail.attacks![0].range).toEqual({ reach: 10 });
    expect(tail.attacks![0].type).toBe("melee");
  });

  it("extracts Legendary Resistance (N/Day) numeric count AND keeps the trait in traits[]", () => {
    const result = toCreatureCanonical(buildEntry(aboleth2024));
    expect(result.legendary_resistance).toBe(3);
    // The trait is preserved (with its prose) so it renders in the TRAITS tab
    // alongside other special traits; the numeric field is additive.
    const lrTrait = result.traits!.find(t => /Legendary Resistance/i.test(t.name));
    expect(lrTrait).toBeDefined();
    expect(lrTrait!.entries?.[0]).toContain("succeed instead");
    expect(result.traits!.find(t => t.name === "Amphibious")).toBeDefined();
  });

  it("preserves 2024 'Legendary Resistance (3/Day, or 4/Day in Lair)' trait with full prose", () => {
    const baseDragon: Record<string, unknown> = {
      ...aboleth2024,
      name: "Adult Black Dragon",
      traits: [
        {
          name: "Legendary Resistance (3/Day, or 4/Day in Lair)",
          desc: "If the dragon fails a saving throw, it can choose to succeed instead.",
        },
        { name: "Amphibious", desc: "The dragon can breathe air and water." },
      ],
    };
    const result = toCreatureCanonical(buildEntry(baseDragon, "2024"));
    const traitNames = result.traits!.map(t => t.name);
    expect(traitNames).toContain("Legendary Resistance (3/Day, or 4/Day in Lair)");
    expect(traitNames).toContain("Amphibious");
    expect(result.legendary_resistance).toBe(3); // numeric still extracted
    const lrTrait = result.traits!.find(t => t.name.startsWith("Legendary Resistance"));
    expect(lrTrait?.entries?.[0]).toContain("succeed instead"); // prose preserved
  });

  it("emits resistance/immunity/condition arrays as flat string keys", () => {
    const base = {
      ...aboleth2024,
      resistances_and_immunities: {
        damage_immunities: [{ key: "psychic", name: "Psychic" }],
        damage_resistances: [{ key: "fire", name: "Fire" }],
        damage_vulnerabilities: [{ key: "thunder", name: "Thunder" }],
        condition_immunities: [{ key: "charmed", name: "Charmed" }],
      },
    };
    const result = toCreatureCanonical(buildEntry(base));
    expect(result.damage_immunities).toEqual(["psychic"]);
    expect(result.damage_resistances).toEqual(["fire"]);
    expect(result.damage_vulnerabilities).toEqual(["thunder"]);
    expect(result.condition_immunities).toEqual(["charmed"]);
  });

  it("source is SRD 5.2 for 2024 edition", () => {
    const result = toCreatureCanonical(buildEntry(aboleth2024, "2024"));
    expect(result.source).toBe("SRD 5.2");
  });

  it("source is SRD 5.1 for 2014 edition", () => {
    const result = toCreatureCanonical(buildEntry(aboleth2024, "2014"));
    expect(result.source).toBe("SRD 5.1");
  });

  it("sorts actions by Open5e order_in_statblock within each action_type bucket", () => {
    // Open5e's `actions` array is alphabetical; the canonical statblock order
    // lives in each action's `order_in_statblock` ordinal (per-bucket).
    const dragon: Record<string, unknown> = {
      ...aboleth2024,
      name: "Adult Black Dragon Test",
      actions: [
        // Alphabetical input — merger must reorder by order_in_statblock.
        { name: "Acid Breath", desc: "Exhales acid.", action_type: "ACTION", order_in_statblock: 2, attacks: [] },
        { name: "Multiattack", desc: "Three attacks.", action_type: "ACTION", order_in_statblock: 0, attacks: [] },
        { name: "Rend", desc: "Bite + claws.", action_type: "ACTION", order_in_statblock: 1, attacks: [] },
        { name: "Spellcasting", desc: "Casts a spell.", action_type: "ACTION", order_in_statblock: 3, attacks: [] },
        { name: "Cloud of Insects", desc: "Insects swarm.", action_type: "LEGENDARY_ACTION", order_in_statblock: 0, attacks: [] },
        { name: "Pounce", desc: "Pounces.", action_type: "LEGENDARY_ACTION", order_in_statblock: 2, attacks: [] },
        { name: "Frightful Presence", desc: "Frightens foes.", action_type: "LEGENDARY_ACTION", order_in_statblock: 1, attacks: [] },
      ],
    };
    const result = toCreatureCanonical(buildEntry(dragon, "2024"));
    expect(result.actions!.map(a => a.name)).toEqual([
      "Multiattack",
      "Rend",
      "Acid Breath",
      "Spellcasting",
    ]);
    expect(result.legendary_actions!.map(a => a.name)).toEqual([
      "Cloud of Insects",
      "Frightful Presence",
      "Pounce",
    ]);
  });
});

describe("creature-merge edition-aware damage location", () => {
  // 2024 layout: primary damage carried in extra_damage_*, damage_* is null.
  const tentacle2024: Record<string, unknown> = {
    ...aboleth2024,
    name: "Aboleth-2024",
    actions: [
      {
        name: "Tentacle",
        desc: "Melee Attack Roll: +9, reach 15 ft.",
        action_type: "ACTION",
        legendary_action_cost: 0,
        attacks: [{
          name: "Tentacle attack",
          attack_type: "WEAPON",
          to_hit_mod: 9,
          reach: 15,
          range: null,
          long_range: null,
          target_creature_only: false,
          damage_die_count: 2,
          damage_die_type: "D6",
          damage_bonus: 5,
          damage_type: null,
          extra_damage_die_count: null,
          extra_damage_die_type: null,
          extra_damage_bonus: null,
          extra_damage_type: { name: "Bludgeoning", key: "bludgeoning" },
          distance_unit: "feet",
        }],
      },
    ],
  };

  it("2024-style: extra_damage_type populated, damage_type null → uses extra_* for primary type", () => {
    const result = toCreatureCanonical(buildEntry(tentacle2024));
    const tentacle = result.actions!.find(a => a.name === "Tentacle")!;
    expect(tentacle.attacks![0].damage_type).toBe("bludgeoning");
    expect(tentacle.attacks![0].damage).toBe("2d6+5");
    expect(tentacle.attacks![0].extra_damage).toBeUndefined();
  });

  // Both populated: damage_* primary, extra_* becomes extra_damage.
  const dragonBite: Record<string, unknown> = {
    ...aboleth2024,
    name: "Bite-Both",
    actions: [
      {
        name: "Rend",
        desc: "Bite",
        action_type: "ACTION",
        legendary_action_cost: 0,
        attacks: [{
          name: "Rend attack",
          attack_type: "WEAPON",
          to_hit_mod: 11,
          reach: 10,
          range: null,
          long_range: null,
          damage_die_count: 2,
          damage_die_type: "D6",
          damage_bonus: 6,
          damage_type: { name: "Slashing", key: "slashing" },
          extra_damage_die_count: 1,
          extra_damage_die_type: "D8",
          extra_damage_bonus: 0,
          extra_damage_type: { name: "Acid", key: "acid" },
          distance_unit: "feet",
        }],
      },
    ],
  };

  it("both primary+extra populated: damage_* is primary, extra_* becomes extra_damage", () => {
    const result = toCreatureCanonical(buildEntry(dragonBite));
    const rend = result.actions!.find(a => a.name === "Rend")!;
    expect(rend.attacks![0].damage).toBe("2d6+6");
    expect(rend.attacks![0].damage_type).toBe("slashing");
    expect(rend.attacks![0].extra_damage).toEqual({ dice: "1d8", type: "acid" });
  });

  // Ranged attack (no reach, has range/long_range)
  const arrow: Record<string, unknown> = {
    ...aboleth2024,
    name: "Archer",
    actions: [
      {
        name: "Longbow",
        desc: "Ranged",
        action_type: "ACTION",
        legendary_action_cost: 0,
        attacks: [{
          name: "Longbow attack",
          attack_type: "WEAPON",
          to_hit_mod: 5,
          reach: null,
          range: 150,
          long_range: 600,
          damage_die_count: 1,
          damage_die_type: "D8",
          damage_bonus: 3,
          damage_type: { name: "Piercing", key: "piercing" },
          extra_damage_die_count: null,
          extra_damage_die_type: null,
          extra_damage_bonus: null,
          extra_damage_type: null,
          distance_unit: "feet",
        }],
      },
    ],
  };

  it("ranged attack: type=ranged with range.normal/long", () => {
    const result = toCreatureCanonical(buildEntry(arrow));
    const longbow = result.actions!.find(a => a.name === "Longbow")!;
    expect(longbow.attacks![0].type).toBe("ranged");
    expect(longbow.attacks![0].range).toEqual({ normal: 150, long: 600 });
  });
});

describe("creature-merge usage_limits → Feature.recharge", () => {
  function makeBaseWithAction(action: Record<string, unknown>): Record<string, unknown> {
    return { ...aboleth2024, actions: [action] };
  }

  it("RECHARGE_ON_ROLL with param=5 → recharge.type=recharge_on_roll, param=5", () => {
    const base = makeBaseWithAction({
      name: "Acid Breath",
      desc: "Exhales acid.",
      action_type: "ACTION",
      usage_limits: { type: "RECHARGE_ON_ROLL", param: 5 },
      attacks: [],
    });
    const result = toCreatureCanonical(buildEntry(base, "2014"));
    const acidBreath = result.actions!.find(a => a.name === "Acid Breath")!;
    expect(acidBreath.recharge).toEqual({ type: "recharge_on_roll", param: 5 });
  });

  it("RECHARGE (2024 alias) with param=4 → recharge.type=recharge_on_roll, param=4", () => {
    const base = makeBaseWithAction({
      name: "Petrifying Gaze",
      desc: "Petrifies a creature.",
      action_type: "ACTION",
      usage_limits: { type: "RECHARGE", param: 4 },
      attacks: [],
    });
    const result = toCreatureCanonical(buildEntry(base, "2024"));
    const gaze = result.actions!.find(a => a.name === "Petrifying Gaze")!;
    expect(gaze.recharge).toEqual({ type: "recharge_on_roll", param: 4 });
  });

  it("PER_DAY with param=3 → recharge.type=per_day, param=3", () => {
    const base = makeBaseWithAction({
      name: "Enslave",
      desc: "Targets one creature.",
      action_type: "ACTION",
      usage_limits: { type: "PER_DAY", param: 3 },
      attacks: [],
    });
    const result = toCreatureCanonical(buildEntry(base, "2014"));
    const enslave = result.actions!.find(a => a.name === "Enslave")!;
    expect(enslave.recharge).toEqual({ type: "per_day", param: 3 });
  });

  it("PER_LONG_REST and PER_SHORT_REST map to canonical types", () => {
    const baseLong = makeBaseWithAction({
      name: "Daily Power",
      desc: "...",
      action_type: "ACTION",
      usage_limits: { type: "PER_LONG_REST", param: 1 },
      attacks: [],
    });
    expect(
      toCreatureCanonical(buildEntry(baseLong, "2024")).actions!.find(a => a.name === "Daily Power")!.recharge,
    ).toEqual({ type: "per_long_rest", param: 1 });

    const baseShort = makeBaseWithAction({
      name: "Surge",
      desc: "...",
      action_type: "ACTION",
      usage_limits: { type: "PER_SHORT_REST", param: 2 },
      attacks: [],
    });
    expect(
      toCreatureCanonical(buildEntry(baseShort, "2024")).actions!.find(a => a.name === "Surge")!.recharge,
    ).toEqual({ type: "per_short_rest", param: 2 });
  });

  it("absent usage_limits → no recharge field on Feature", () => {
    const base = makeBaseWithAction({
      name: "Slam",
      desc: "Hits.",
      action_type: "ACTION",
      attacks: [],
    });
    const result = toCreatureCanonical(buildEntry(base, "2014"));
    const slam = result.actions!.find(a => a.name === "Slam")!;
    expect(slam.recharge).toBeUndefined();
  });

  it("unknown usage_limits.type → recharge dropped (no field) and warning logged", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const base = makeBaseWithAction({
      name: "Mystery",
      desc: "...",
      action_type: "ACTION",
      usage_limits: { type: "FUTURE_NEW_TYPE", param: 99 },
      attacks: [],
    });
    const result = toCreatureCanonical(buildEntry(base, "2024"));
    const mystery = result.actions!.find(a => a.name === "Mystery")!;
    expect(mystery.recharge).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("FUTURE_NEW_TYPE"),
    );
    warnSpy.mockRestore();
  });
});

describe("creature-merge prose-to-formula-tag conversion", () => {
  it("converts 2014 action prose to formula tags", () => {
    const result = toCreatureCanonical({
      slug: "test_aboleth",
      edition: "2014",
      kind: "creature",
      base: {
        name: "Aboleth",
        size: { key: "large" },
        type: { key: "aberration" },
        armor_class: 17,
        hit_points: 135,
        hit_dice: "18d10+36",
        challenge_rating: 10,
        ability_scores: {
          strength: 21, dexterity: 9, constitution: 15,
          intelligence: 18, wisdom: 15, charisma: 18,
        },
        actions: [
          {
            name: "Tail",
            desc: "Melee Weapon Attack: +9 to hit, reach 10 ft., one target. Hit: 15 (3d6 + 5) bludgeoning damage.",
            action_type: "ACTION",
            attacks: [],
          },
        ],
      } as never,
      structured: null,
      activation: null,
      overlay: null,
    });
    const tail = result.actions!.find(a => a.name === "Tail")!;
    expect(tail.entries![0]).toContain("`atk:STR+PB`");
    expect(tail.entries![0]).toContain("`dmg:3d6+STR`");
  });

  it("converts 2024 action prose to formula tags (Melee Attack Roll form)", () => {
    // 2024 Adult Black Dragon: STR 23 (mod +6), PB 5 → STR+PB = 11
    const result = toCreatureCanonical({
      slug: "test_dragon",
      edition: "2024",
      kind: "creature",
      base: {
        name: "Adult Black Dragon",
        size: { key: "huge" },
        type: { key: "dragon" },
        armor_class: 19,
        hit_points: 195,
        hit_dice: "17d12+85",
        challenge_rating: 14,
        ability_scores: {
          strength: 23, dexterity: 14, constitution: 21,
          intelligence: 14, wisdom: 13, charisma: 19,
        },
        actions: [
          {
            name: "Rend",
            desc: "Melee Attack Roll: +11, reach 10 ft. 13 (2d6 + 6) Slashing damage plus 4 (1d8) Acid damage.",
            action_type: "ACTION",
            attacks: [],
          },
        ],
      } as never,
      structured: null,
      activation: null,
      overlay: null,
    });
    const rend = result.actions!.find(a => a.name === "Rend")!;
    expect(rend.entries![0]).toContain("`atk:STR+PB`");
  });

  it("does not produce wrong-ability tags for 2024 explicit-ability saves", () => {
    // Adult Black Dragon: CON mod 5 + PB 5 + 8 = 18 (Pass 1b would mistakenly
    // pick CON). Prose says "Dexterity" — must NOT emit dc:CON.
    const result = toCreatureCanonical({
      slug: "test_dragon",
      edition: "2024",
      kind: "creature",
      base: {
        name: "Adult Black Dragon",
        size: { key: "huge" },
        type: { key: "dragon" },
        armor_class: 19,
        hit_points: 195,
        hit_dice: "17d12+85",
        challenge_rating: 14,
        ability_scores: {
          strength: 23, dexterity: 14, constitution: 21,
          intelligence: 14, wisdom: 13, charisma: 19,
        },
        actions: [
          {
            name: "Acid Breath",
            desc: "Dexterity Saving Throw: DC 18, each creature in a 60-foot-long, 5-foot-wide Line. Failure: 54 (12d8) Acid damage. Success: Half damage.",
            action_type: "ACTION",
            attacks: [],
          },
        ],
      } as never,
      structured: null,
      activation: null,
      overlay: null,
    });
    const breath = result.actions!.find(a => a.name === "Acid Breath")!;
    expect(breath.entries![0]).not.toContain("`dc:CON`");
  });

  it("converts trait prose to formula tags", () => {
    const result = toCreatureCanonical({
      slug: "test_trait",
      edition: "2014",
      kind: "creature",
      base: {
        name: "Wolf",
        size: { key: "medium" },
        type: { key: "beast" },
        armor_class: 13,
        hit_points: 11,
        challenge_rating: "1/4",
        ability_scores: {
          strength: 12, dexterity: 15, constitution: 12,
          intelligence: 3, wisdom: 12, charisma: 6,
        },
        actions: [
          {
            name: "Bite",
            desc: "Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 7 (2d4 + 2) piercing damage. If the target is a creature, it must succeed on a DC 11 Strength saving throw or be knocked prone.",
            action_type: "ACTION",
            attacks: [],
          },
        ],
        traits: [
          { name: "Pack Tactics", desc: "The wolf has advantage on an attack roll." },
        ],
      } as never,
      structured: null,
      activation: null,
      overlay: null,
    });
    const bite = result.actions!.find(a => a.name === "Bite")!;
    expect(bite.entries![0]).toContain("`atk:DEX+PB`");
    expect(bite.entries![0]).toContain("`dc:STR`");
  });

  it("uses CR-derived prof bonus when base.proficiency_bonus is null", () => {
    // CR 14 → PB 5; STR 23 (+6); STR+PB = 11
    const result = toCreatureCanonical({
      slug: "test_pb",
      edition: "2024",
      kind: "creature",
      base: {
        name: "Test",
        size: { key: "huge" },
        type: { key: "dragon" },
        armor_class: 19,
        hit_points: 195,
        challenge_rating: 14,
        proficiency_bonus: null, // confirmed null in real data
        ability_scores: {
          strength: 23, dexterity: 14, constitution: 21,
          intelligence: 14, wisdom: 13, charisma: 19,
        },
        actions: [
          { name: "Slam", desc: "Melee Attack Roll: +11, reach 10 ft. 8 (1d8 + 6) Bludgeoning damage.", action_type: "ACTION", attacks: [] },
        ],
      } as never,
      structured: null,
      activation: null,
      overlay: null,
    });
    const slam = result.actions!.find(a => a.name === "Slam")!;
    expect(slam.entries![0]).toContain("`atk:STR+PB`");
  });
});

/**
 * R4-G7 T5 · the SRD monster data floor (spec §8.1 item 4).
 *
 * (a) THE PROFICIENCY PREDICATE. Open5e emits a save / skill bonus for every ability on part of the
 *     corpus (MEASURED at 0.3.3 over both caches: 339 creatures carry all six saves · 331 of them
 *     the whole 2024 set · 8 carry all eighteen skills, and 204 carry at least one entry whose value
 *     is 0), so the shipped stat blocks list saves and skills RAW does not give the creature. The
 *     rule is: emit an entry only when it EXCEEDS the plain ability modifier, which is the only
 *     thing a proficiency or an expertise can ever do to it.
 *
 *     "Exceeds", not "differs", and that is forced by the data rather than chosen: the eight beasts
 *     of burden (Camel, Donkey, Draft Horse, Elephant, Mule, Pony, Riding Horse, Warhorse) carry an
 *     all-ZERO save block against nonzero modifiers · 18 save and 16 skill entries BELOW the
 *     modifier, all eight creatures, 0 in the 2024 cache. `!==` would keep every one of them and the
 *     Donkey would ship four saves it does not have, which is the outcome §8.1 item 4(a) names as
 *     wrong. Every entry this predicate keeps still DIFFERS from its modifier, so §15 row 15's
 *     clause holds either way.
 *
 * (b) THE OVERLAY. `pickOverlay` returned a hardcoded `null` with the comment "no overlay applies
 *     here"; four SRD 5.1 creatures make that false (empty `speed`, null `hit_dice`), so it now
 *     resolves the new `creatures:` section by bare slug and the comment says what it does.
 */
describe("creature-merge: the save / skill proficiency floor (R4-G7 T5)", () => {
  const archmage2014: Record<string, unknown> = {
    key: "srd_archmage", name: "Archmage", document: { name: "SRD 5.1", key: "srd" },
    size: { name: "Medium", key: "medium" }, type: { name: "Humanoid", key: "humanoid" },
    armor_class: 12, hit_points: 99, hit_dice: "18d8+18", challenge_rating: 12,
    ability_scores: { strength: 10, dexterity: 14, constitution: 12, intelligence: 20, wisdom: 15, charisma: 16 },
    modifiers: { strength: 0, dexterity: 2, constitution: 1, intelligence: 5, wisdom: 2, charisma: 3 },
    // The 2024 cache shape: every ability present, only two of them actually proficient.
    saving_throws: { strength: 0, dexterity: 2, constitution: 1, intelligence: 9, wisdom: 6, charisma: 3 },
    skill_bonuses: { arcana: 13, history: 9, perception: 6, athletics: 0, stealth: 2 },
    speed: { walk: 30, unit: "feet" },
    languages: { as_string: "Common" },
    resistances_and_immunities: {}, actions: [], traits: [],
  };

  const donkey2014: Record<string, unknown> = {
    key: "srd_donkey", name: "Donkey", document: { name: "SRD 5.1", key: "srd" },
    size: { name: "Medium", key: "medium" }, type: { name: "Beast", key: "beast" },
    armor_class: 10, hit_points: 11, hit_dice: null, challenge_rating: 0,
    ability_scores: { strength: 14, dexterity: 10, constitution: 13, intelligence: 2, wisdom: 10, charisma: 5 },
    modifiers: { strength: 2, dexterity: 0, constitution: 1, intelligence: -4, wisdom: 0, charisma: -3 },
    // The beast-of-burden shape: an all-zero block against nonzero modifiers.
    saving_throws: { strength: 0, dexterity: 0, constitution: 0, intelligence: 0, wisdom: 0, charisma: 0 },
    skill_bonuses: { athletics: 0, perception: 0, stealth: 0 },
    speed: { walk: 0, unit: "feet" },
    languages: { as_string: "" },
    resistances_and_immunities: {}, actions: [], traits: [],
  };

  it("keeps exactly the Archmage's two proficient saves and drops the four that equal the modifier", () => {
    const out = toCreatureCanonical(buildEntry(archmage2014, "2014"));
    expect(out.saves).toEqual({ int: 9, wis: 6 });
  });

  it("keeps only the skills that exceed their ability modifier", () => {
    const out = toCreatureCanonical(buildEntry(archmage2014, "2014"));
    // arcana / history / perception are proficient; athletics (0 = STR 0) and stealth (2 = DEX 2) are not.
    expect(out.skills).toEqual({ arcana: 13, history: 9, perception: 6 });
  });

  it("gives the Donkey no saves and no skills at all, against its all-zero upstream block", () => {
    const out = toCreatureCanonical(buildEntry(donkey2014, "2014"));
    expect(out.saves).toBeUndefined();
    expect(out.skills).toBeUndefined();
  });

  it("keeps a genuine zero on a NEGATIVE ability: the Zombie's RAW Wis +0 (WIS -2 plus PB 2)", () => {
    // The one-key upstream block the placeholder guard must NOT swallow. MEASURED at 0.3.3:
    // the 2014 Zombie and Ogre Zombie carry `{wisdom: 0}` and nothing else.
    const zombie = {
      ...donkey2014, key: "srd_zombie", name: "Zombie",
      ability_scores: { strength: 13, dexterity: 6, constitution: 16, intelligence: 3, wisdom: 6, charisma: 5 },
      modifiers: { strength: 1, dexterity: -2, constitution: 3, intelligence: -4, wisdom: -2, charisma: -3 },
      saving_throws: { wisdom: 0 },
      skill_bonuses: {},
    };
    expect(toCreatureCanonical(buildEntry(zombie, "2014")).saves).toEqual({ wis: 0 });
  });

  it("the placeholder guard fires ONLY on an exhaustive all-zero block over nonzero modifiers", () => {
    const mods: Record<string, number> = { str: 2, dex: 0, con: 1, int: -4, wis: 0, cha: -3 };
    const zeroSix = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };
    expect(isPlaceholderBonusBlock(zeroSix, 6, (k) => mods[k])).toBe(true);
    // Short block (the Zombie): real data.
    expect(isPlaceholderBonusBlock({ wis: 0 }, 6, (k) => mods[k])).toBe(false);
    // A real bonus anywhere: real data.
    expect(isPlaceholderBonusBlock({ ...zeroSix, int: 9 }, 6, (k) => mods[k])).toBe(false);
    // The 2024 Commoner: six zeroes on six +0 abilities are simply true.
    expect(isPlaceholderBonusBlock(zeroSix, 6, () => 0)).toBe(false);
  });

  it("applies an authored creatures overlay: the Donkey's speed and hit-dice formula", () => {
    const entry = buildEntry(donkey2014, "2014");
    entry.overlay = creatureMergeRule.pickOverlay(
      { creatures: { donkey: { speed: { walk: 40 }, hp: { formula: "2d8+2" } } } } as never,
      "srd_donkey",
    );
    const out = toCreatureCanonical(entry);
    expect(out.speed).toEqual({ walk: 40 });
    expect(out.hp).toEqual({ average: 11, formula: "2d8+2" });
  });

  it("pickOverlay resolves the creatures section by BARE slug and returns null when nothing is authored", () => {
    expect(creatureMergeRule.pickOverlay({ creatures: { donkey: { speed: { walk: 40 } } } } as never, "srd_donkey"))
      .toEqual({ speed: { walk: 40 } });
    expect(creatureMergeRule.pickOverlay({ creatures: { donkey: { speed: { walk: 40 } } } } as never, "srd_archmage"))
      .toBeNull();
    expect(creatureMergeRule.pickOverlay({} as never, "srd_donkey")).toBeNull();
  });

  it("merges the authored modes into the emitted ones rather than replacing the block", () => {
    const entry = buildEntry({ ...donkey2014, speed: { walk: 0, swim: 20, unit: "feet" } }, "2014");
    entry.overlay = creatureMergeRule.pickOverlay(
      { creatures: { donkey: { speed: { walk: 40 } } } } as never,
      "srd_donkey",
    );
    expect(toCreatureCanonical(entry).speed).toEqual({ swim: 20, walk: 40 });
  });

  it("keeps an authored zero, which is the Shrieker's RAW speed", () => {
    const entry = buildEntry({ ...donkey2014, name: "Shrieker", key: "srd_shrieker" }, "2014");
    entry.overlay = creatureMergeRule.pickOverlay(
      { creatures: { shrieker: { speed: { walk: 0 } } } } as never,
      "srd_shrieker",
    );
    expect(toCreatureCanonical(entry).speed).toEqual({ walk: 0 });
  });
});
