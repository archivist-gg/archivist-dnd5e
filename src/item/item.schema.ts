import { z } from "zod";
import { imageField } from "@archivist-gg/dnd5e/schemas/entity-extras-schema";

// --------------------------------------------------------------------------
// Condition schemas - discriminated union with recursive any_of.
// --------------------------------------------------------------------------

import type { Condition } from "@archivist-gg/dnd5e/types/item-conditions.types";

const tier1Conditions = [
  z.object({ kind: z.literal("no_armor") }),
  z.object({ kind: z.literal("no_shield") }),
  z.object({ kind: z.literal("wielding_two_handed") }),
  z.object({ kind: z.literal("is_class"), value: z.string() }),
  z.object({ kind: z.literal("is_race"), value: z.string() }),
  z.object({ kind: z.literal("is_subclass"), value: z.string() }),
] as const;

const tier2Conditions = [
  z.object({ kind: z.literal("vs_creature_type"), value: z.string() }),
  z.object({ kind: z.literal("vs_attack_type"), value: z.enum(["ranged", "melee"]) }),
  z.object({ kind: z.literal("on_attack_type"), value: z.enum(["ranged", "melee"]) }),
  z.object({ kind: z.literal("with_weapon_property"), value: z.string() }),
  z.object({ kind: z.literal("vs_spell_save") }),
] as const;

const tier3Conditions = [
  z.object({ kind: z.literal("lighting"), value: z.enum(["dim", "bright", "daylight", "darkness"]) }),
  z.object({ kind: z.literal("underwater") }),
  z.object({ kind: z.literal("movement_state"), value: z.enum(["flying", "swimming", "climbing", "mounted"]) }),
] as const;

const tier4Conditions = [
  z.object({ kind: z.literal("has_condition"), value: z.string() }),
  z.object({ kind: z.literal("is_concentrating") }),
  z.object({ kind: z.literal("bloodied") }),
] as const;

const rawCondition = z.object({ kind: z.literal("raw"), text: z.string() });

export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    ...tier1Conditions,
    ...tier2Conditions,
    ...tier3Conditions,
    ...tier4Conditions,
    rawCondition,
    z.object({ kind: z.literal("any_of"), conditions: z.array(conditionSchema) }),
  ]),
);

const conditionalBonusSchema = z.object({
  value: z.number().int(),
  when: z.array(conditionSchema),
});

// Bonuses arrive as a plain number or a conditional object. The merger
// boundary (item-merge.ts:coerceBonusNumber) coerces upstream signed-int
// strings (e.g. structured-rules "+3") to numbers before they reach the
// canonical bundle, so the runtime accessor only ever sees numbers.
const numberOrConditional = z.union([z.number().int(), conditionalBonusSchema]);

// Module-private, like the ten other copies in this package (pc, background,
// subclass, optional-feature, feat, feature-effect …). `abilityEnum` is exported
// from nowhere in dnd5e; introducing an export is out of scope for this change.
const abilityEnum = z.enum(["str", "dex", "con", "int", "wis", "cha"]);

const bonusesSchema = z.object({
  ac: numberOrConditional.optional(),
  weapon_attack: numberOrConditional.optional(),
  weapon_damage: numberOrConditional.optional(),
  spell_attack: numberOrConditional.optional(),
  spell_save_dc: numberOrConditional.optional(),
  saving_throws: numberOrConditional.optional(),
  // Converter-measured (spec §4): 24 / 3 / 2 / 1 carriers. Same numberOrConditional
  // shape as the six above, so a conditional arm is legal on these too.
  spell_damage: numberOrConditional.optional(),
  ability_check: numberOrConditional.optional(),
  proficiency_bonus: numberOrConditional.optional(),
  saving_throw_concentration: numberOrConditional.optional(),
  ability_scores: z.object({
    // partial: each ability is independently optional. z.record(enum, …) in
    // Zod v4 treats every enum key as required, which doesn't match the
    // data (e.g. Amulet of Health only sets `con: 19`).
    static: z.object({
      str: z.number().int().optional(),
      dex: z.number().int().optional(),
      con: z.number().int().optional(),
      int: z.number().int().optional(),
      wis: z.number().int().optional(),
      cha: z.number().int().optional(),
    }).optional(),
    bonus: z.object({
      str: numberOrConditional.optional(),
      dex: numberOrConditional.optional(),
      con: numberOrConditional.optional(),
      int: numberOrConditional.optional(),
      wis: numberOrConditional.optional(),
      cha: numberOrConditional.optional(),
    }).optional(),
    // "choose `count` of `from`, each +`amount`" (6 measured leaves). `amount` is
    // OPTIONAL: Lost Laboratory of Kwalish/Deck of Several Things carries
    // {from: [all six], count: 1} with NO amount, and a required `amount` would
    // refuse that document outright.
    choose: z.array(z.strictObject({
      from: z.array(abilityEnum),
      count: z.number().int().positive(),
      amount: z.number().int().optional(),
    })).optional(),
  }).optional(),
  speed: z.object({
    walk: numberOrConditional.optional(),
    fly: z.union([numberOrConditional, z.literal("walk")]).optional(),
    swim: numberOrConditional.optional(),
    climb: numberOrConditional.optional(),
  }).optional(),
});

const chargesSchema = z.object({
  max: z.number().int(),
  // Dice regained per recharge, e.g. "1d4 - 1" (68 carriers). Distinct from
  // `recharge_amount`, which the canonical pipeline also emits as a string.
  dice: z.string().optional(),
  recharge: z.string().optional(),
  recharge_amount: z.string().optional(),
  destroy_on_empty: z.object({
    roll: z.string(),
    threshold: z.number().int(),
    effect: z.string().optional(),
  }).optional(),
});

const attachedSpellsSchema = z.object({
  charges: z.record(z.string(), z.array(z.string())).optional(),
  daily: z.record(z.string(), z.array(z.string())).optional(),
  will: z.array(z.string()).optional(),
  rest: z.record(z.string(), z.array(z.string())).optional(),
  // `limited` = total uses with no recharge (item often consumed when empty).
  // Distinct from `charges` (cost-per-cast) and `daily` (resets per day).
  // Source canonical pipeline emits this for Necklace of Fireballs, Helm of
  // Brilliance, Candle of Invocation, Efreeti Bottle. Key is total available
  // uses (e.g. "9": ["fireball"] for the necklace's 9 beads).
  limited: z.record(z.string(), z.array(z.string())).optional(),
  // Converter-measured (spec §4): spells the item lists without a cost model (18),
  // the casting ability for the item's attached spells (10), and ritual-only
  // spells (1).
  other: z.array(z.string()).optional(),
  ability: z.string().optional(),
  ritual: z.array(z.string()).optional(),
});

// A tag is a single attunement restriction. The union is first-match, so every
// key a leaf actually carries must be declared on the arm that matches it first —
// otherwise the extra key is silently STRIPPED (that was the bug: `alignment`
// beside `class`, `race` beside `alignment`, `size` beside `creature_type`).
// Measured leaf shapes over the converter corpus: class string 291 · spellcasting
// boolean 65 · race string 38 · alignment array<string> 29 (ZERO bare strings —
// the wider `string | string[]` arm is kept deliberately, it costs nothing and a
// bare string is the obvious next variant) · creature_type string 10 ·
// background string 10 · psionics boolean 2 · int number 1 ·
// skill_proficiency array<string> 1 · language_proficiency array<string> 1 ·
// size string 1 ("S", Propeller Helm).
const attunementTagSchema = z.union([
  z.object({
    class: z.string(),
    subclass: z.string().optional(),
    alignment: z.union([z.string(), z.array(z.string())]).optional(),
  }),
  // alignment can be a single string OR an array of alignment-letter codes
  // (e.g. ["G"] for good, ["L", "G"] for lawful good).
  z.object({
    alignment: z.union([z.string(), z.array(z.string())]),
    race: z.string().optional(),
  }),
  z.object({
    race: z.string(),
    alignment: z.union([z.string(), z.array(z.string())]).optional(),
  }),
  z.object({ creature_type: z.string(), size: z.string().optional() }),
  z.object({ spellcasting: z.boolean() }),
  z.object({ background: z.string() }),
  z.object({ psionics: z.boolean() }),
  z.object({ int: z.number().int() }),
  z.object({ skill_proficiency: z.array(z.string()) }),
  z.object({ language_proficiency: z.array(z.string()) }),
]);

const attunementCanonicalSchema = z.object({
  required: z.boolean(),
  restriction: z.string().optional(),
  tags: z.array(attunementTagSchema).optional(),
});

const grantsSchema = z.object({
  proficiency: z.boolean().optional(),
  languages: z.union([z.boolean(), z.array(z.string())]).optional(),
  senses: z.object({
    darkvision: z.number().optional(),
    tremorsense: z.number().optional(),
    truesight: z.number().optional(),
    blindsight: z.number().optional(),
  }).optional(),
});

// Structured 5etools container capacity (31 carriers). Measured key-sets:
// {weight} 8 · {volume} 8 · {item} 6 · {weight,weightless} 5 · {item,weightless} 2
// · {item,weight} 2. `item` entries are records of "<item tag>": <count>, e.g.
// {"sling bullet|xphb": 20}. STRICT on purpose (spec §3.2's fail-loud policy): a
// new capacity key must refuse visibly rather than vanish.
const containerCapacitySchema = z.strictObject({
  weight: z.array(z.number()).optional(),
  item: z.array(z.record(z.string(), z.number())).optional(),
  weightless: z.boolean().optional(),
  volume: z.array(z.number()).optional(),
});

const containerSchema = z.object({
  capacity_weight: z.number().optional(),
  weightless: z.boolean().optional(),
  pack_contents: z.array(z.string()).optional(),
  capacity: containerCapacitySchema.optional(),
});

const lightSchema = z.object({
  bright_radius: z.number(),
  dim_radius: z.number(),
});

// The converter emits a DIFFERENT spelling: an array of per-source entries keyed
// bright/dim/shape (97 entries over 81 docs; key-sets {dim} 76 · {bright,dim} 17 ·
// {bright,dim,shape} 3 · {bright,shape} 1). The 173 object-form carriers are all
// exactly {bright_radius, dim_radius} = `lightSchema` above. The two spellings are
// NEVER unified: each arm pins what its own carriers actually write.
const lightEntrySchema = z.strictObject({
  bright: z.number().optional(),
  dim: z.number().optional(),
  shape: z.string().optional(),
});

export const itemEntitySchema = z.object({
  name: z.string().min(1),
  slug: z.string().optional(),
  type: z.string().optional(),
  rarity: z.string().optional(),
  base_item: z.string().optional(),

  bonuses: bonusesSchema.optional(),
  resist: z.array(z.string()).optional(),
  immune: z.array(z.string()).optional(),
  vulnerable: z.array(z.string()).optional(),
  condition_immune: z.array(z.string()).optional(),

  charges: z.union([chargesSchema, z.number().int().nonnegative()]).optional(),
  attached_spells: attachedSpellsSchema.optional(),
  attunement: z.union([attunementCanonicalSchema, z.boolean(), z.string()]).optional(),
  grants: grantsSchema.optional(),
  container: containerSchema.optional(),
  light: z.union([lightSchema, z.array(lightEntrySchema).nonempty()]).optional(),

  cursed: z.boolean().optional(),
  sentient: z.boolean().optional(),
  // 54 docs carry a LIST of classes that may use the item as a focus
  // (e.g. ["Druid", "Ranger"]); 26 carry a single string, 2 a boolean.
  focus: z.union([z.boolean(), z.string(), z.array(z.string())]).optional(),
  tier: z.enum(["major", "minor"]).optional(),

  damage: z.union([
    z.object({
      dice: z.string(),
      type: z.string(),
      versatile_dice: z.string().optional(),
    }),
    z.string(),
  ]).optional(),
  weapon_category: z.string().optional(),
  armor_category: z.string().optional(),

  weight: z.union([z.number(), z.string()]).optional(),
  cost: z.string().optional(),
  source: z.string().optional(),
  page: z.number().int().optional(),
  edition: z.string().optional(),
  description: z.string().optional(),
  entries: z.array(z.unknown()).optional(),
  effects: z.array(z.unknown()).optional(),
  damage_riders: z.array(z.object({
    amount: z.string(),
    damage_type: z.string(),
    applies_to: z.enum(["weapon", "spell", "all"]).optional(),
    condition: z.string().optional(),
  })).optional(),

  // Scroll & unidentified-item markers (Phase 4). Declared here so they survive
  // parse (the schema strips undeclared keys) and are ALSO listed in the
  // parser's KNOWN_KEYS so they are not additionally copied into `raw`.
  scroll_level: z.number().optional(),
  unidentified: z.boolean().optional(),
  masked_category: z.string().optional(),

  // Converter-modelled top-level keys (spec §4). Declared here so they survive
  // parse AND listed in the parser's KNOWN_KEYS so they are not additionally
  // copied into `raw` — the schema and the raw-bag are independent gates.
  // `modify_speed` (124 carriers): equal 101 (string-valued, e.g. {fly: "walk"}) ·
  // static 20 · multiply 3 · bonus 1 (keyed "*").
  modify_speed: z.strictObject({
    equal: z.record(z.string(), z.string()).optional(),
    static: z.record(z.string(), z.number()).optional(),
    multiply: z.record(z.string(), z.number()).optional(),
    bonus: z.record(z.string(), z.number()).optional(),
  }).optional(),
  // Carried by all 6,046 converter item docs, ALWAYS as the empty string today:
  // `.min(1)` is forbidden here.
  rendering_hint: z.string().optional(),
  has_fluff: z.boolean().optional(),
  has_fluff_images: z.boolean().optional(),
  // Already `.optional()` at its source — never append a second one.
  image: imageField,

  raw: z.record(z.string(), z.unknown()).optional(),

  // Legacy fields preserved
  damage_dice: z.string().optional(),
  damage_type: z.string().optional(),
  properties: z.array(z.string()).optional(),
  recharge: z.string().optional(),
  curse: z.boolean().optional(),
});
