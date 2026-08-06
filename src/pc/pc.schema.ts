import { z } from "zod";
import { CONDITION_SLUGS } from "./conditions.constants";

const conditionSlugEnum = z.enum(CONDITION_SLUGS);

const abilityEnum = z.enum(["str", "dex", "con", "int", "wis", "cha"]);

const skillEnum = z.enum([
  "acrobatics", "animal-handling", "arcana", "athletics", "deception",
  "history", "insight", "intimidation", "investigation", "medicine",
  "nature", "perception", "performance", "persuasion", "religion",
  "sleight-of-hand", "stealth", "survival",
]);

const proficiencyTri = z.enum(["none", "proficient", "expertise"]);

const slotEnum = z.enum(["mainhand", "offhand", "armor", "shield"]);

const equipmentEntryOverridesSchema = z.object({
  name: z.string().optional(),
  bonus: z.number().int().optional(),
  damage_bonus: z.number().int().optional(),
  extra_damage: z.string().optional(),
  ac_bonus: z.number().int().optional(),
  action: z.enum(["action", "bonus-action", "reaction", "free", "special"]).optional(),
  range: z.string().optional(),
  // Per-instance defense arrays. The EquipmentEntryOverrides type declares
  // these and pc.equipment reads them into defenses, but the strict schema
  // used to omit them, so a file carrying one failed the WHOLE parse. Admitted
  // here so a per-instance resist/immune/vulnerable/condition_immune loads.
  resist: z.array(z.string()).optional(),
  immune: z.array(z.string()).optional(),
  vulnerable: z.array(z.string()).optional(),
  condition_immune: z.array(z.string()).optional(),
  // Scroll authoring: a per-instance spell payload (e.g. a Spell Scroll's spell)
  // plus the ability that governs its save DC / attack when cast from the scroll.
  spell: z.string().optional(),
  spell_ability: abilityEnum.optional(),
}).strict();

const equipmentEntryStateSchema = z.object({
  charges: z.object({
    current: z.number().int().nonnegative(),
    max: z.number().int().nonnegative(),
  }).optional(),
  recovery: z.object({
    amount: z.string(),
    reset: z.enum(["dawn", "short", "long", "special"]),
  }).optional(),
  depletion_risk: z.object({
    trigger: z.string(),
    roll: z.string(),
    threshold: z.number().int(),
    effect: z.string(),
  }).optional(),
}).strict();

const equipmentEntrySchema = z.object({
  item: z.string().min(1),
  equipped: z.boolean().optional(),
  attuned: z.boolean().optional(),
  qty: z.number().int().positive().optional(),
  notes: z.string().optional(),
  slot: slotEnum.nullable().optional(),
  overrides: equipmentEntryOverridesSchema.optional(),
  state: equipmentEntryStateSchema.optional(),
  // Build-only provenance for Equipment-step-seeded gear (e.g. "builder:starting",
  // "builder:gold-buy"). Permissive plain string; stripped by finishBuild so a
  // finished file never carries it.
  granted_by: z.string().optional(),
});

// Exported as a bare ZodObject so the parity guard can read `.shape`: the schema
// actually mounted on the character is the `.default({})` wrapper below, and a
// ZodDefault has no `.shape`.
export const characterOverridesShape = z.object({
  scores: z.partialRecord(abilityEnum, z.number().int()).optional(),
  saves: z.partialRecord(abilityEnum, z.object({
    bonus: z.number().int().optional(),
    proficient: z.boolean().optional(),
  })).optional(),
  skills: z.partialRecord(skillEnum, z.object({
    bonus: z.number().int(),
    proficiency: proficiencyTri.optional(),
  })).optional(),
  passives: z.object({
    perception: z.number().int().optional(),
    investigation: z.number().int().optional(),
    insight: z.number().int().optional(),
  }).partial().optional(),
  hp: z.object({
    max: z.number().int().positive().optional(),
    rolled: z.number().int().positive().optional(),
    modifier: z.number().int().optional(),
  }).optional(),
  ac: z.number().int().optional(),
  speed: z.number().int().optional(),
  initiative: z.number().int().optional(),
  spellcasting_ability_by_class: z.record(z.string(), abilityEnum).optional(),
  // Character-level DC-ability fallback for own-ability-less spells (e.g. a Spell
  // Scroll cast by a non-caster). Same ability enum as the per-instance spell_ability.
  spellcasting_ability: abilityEnum.optional(),
  spell_slots: z.record(z.coerce.number().int(), z.number().int().nonnegative()).optional(),
  attunement_limit: z.number().int().nonnegative().optional(),
  /** Manual proficiency edits. `remove` SUPPRESSES a rules-granted entry ("a dwarf who doesn't know
   *  dwarvish"). NOTHING here may carry a default, at either level, or an untouched note stops being
   *  byte-identical:
   *    - a `.default({})` on `languages`/`tools` materializes the key on every note that carries any
   *      `overrides` block at all;
   *    - a `.default([])` on `add`/`remove` materializes the sibling array whenever the parent key IS
   *      present, which is every add-only entry the mutators write. (It cannot fire while the parent
   *      is absent, but that is the uninteresting half of the case.)
   *  Every reader uses `?? []`. */
  languages: z.object({ add: z.array(z.string()).optional(), remove: z.array(z.string()).optional() }).optional(),
  tools:     z.object({ add: z.array(z.string()).optional(), remove: z.array(z.string()).optional() }).optional(),
  /** Manual defense edits. SUPPRESSION-ONLY, and the missing `add` channel is a DELIBERATE
   *  asymmetry with `languages`/`tools` above · do not "complete the pattern". The additive
   *  store is `character.defenses.*`, which already exists and works; a second additive
   *  channel would recreate exactly the two-writers divergence R4-P5 exists to remove.
   *  Entries are matched by `toDefenseSlug` (pc.defense-normalize.ts) at read time, so a note
   *  may author any spelling; the schema persists what was written, verbatim.
   *  The no-defaults rule of the block above applies here at all three levels: a default on
   *  `defenses`, on a bucket, or on `remove` rewrites an untouched note. Readers use `?? []`. */
  defenses: z.object({
    resistances:          z.object({ remove: z.array(z.string()).optional() }).optional(),
    immunities:           z.object({ remove: z.array(z.string()).optional() }).optional(),
    vulnerabilities:      z.object({ remove: z.array(z.string()).optional() }).optional(),
    condition_immunities: z.object({ remove: z.array(z.string()).optional() }).optional(),
  }).optional(),
});

const characterOverridesSchema = characterOverridesShape.default({});

/** The overrides key set as a type. Paired with `keyof CharacterOverrides` by the compile-time parity
 *  assertion in pc.types.ts, which is what actually stops a one-sided addition. */
export type CharacterOverridesSchemaKeys = keyof z.infer<typeof characterOverridesShape>;

const characterStateSchema = z.object({
  hp: z.object({
    current: z.number().int(),
    max: z.number().int(),
    temp: z.number().int().nonnegative(),
  }),
  hit_dice: z.record(z.string(), z.object({
    used: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  })).default({}),
  spell_slots: z.record(z.coerce.number().int(), z.object({
    used: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  })).default({}),
  spell_slots_pact: z.object({
    level: z.number().int().nonnegative(),
    used: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }).optional(),
  concentration: z.string().nullable().default(null),
  conditions: z.array(conditionSlugEnum).default([]),
  exhaustion: z.number().int().min(0).max(6).default(0),
  death_saves: z.object({
    successes: z.number().int().min(0).max(3),
    failures: z.number().int().min(0).max(3),
  }).optional(),
  inspiration: z.number().int().nonnegative().default(0),
  currency: z.object({
    cp: z.number().int().nonnegative(),
    sp: z.number().int().nonnegative(),
    ep: z.number().int().nonnegative(),
    gp: z.number().int().nonnegative(),
    pp: z.number().int().nonnegative(),
  }).optional(),
  feature_uses: z.record(z.string(), z.object({
    used: z.number().int().nonnegative(),
    max:  z.number().int().nonnegative(),
  })).default({}),
  // Phase 3 activatable buffs: ids/slugs of activatable features/boons that are
  // currently toggled on. Their effects fold into recalc only while listed here.
  active_buffs: z.array(z.string()).optional(),
  attuned_items: z.array(z.string()).optional(),
});

/** Expected persisted decision shapes: entity slug / inline value (string),
 *  multi-select slugs (string[]), ability-points allocation (record). The
 *  trailing `.catch` keeps legacy or hand-edited oddities (null, numbers,
 *  booleans) loadable — one stray value must never fail the whole character
 *  parse. `.catch` passes the original input through unchanged on a union
 *  miss (no value dropped) while keeping the inferred output type narrow so
 *  `z.unknown()` never leaks into ChoiceValue. Readers narrow defensively
 *  (ChoiceValue in pc.types). The documented union without the catch-all is:
 *    z.union([z.string(), z.array(z.string()), z.record(z.string(), z.unknown())]) */
const choiceValueSchema = z
  .union([
    z.string(),
    z.array(z.string()),
    z.record(z.string(), z.unknown()),
  ])
  .catch((ctx) => ctx.value as string);

const classEntrySchema = z.object({
  name: z.string().min(1),
  level: z.number().int().min(1).max(20),
  subclass: z.string().nullable().default(null),
  // Per-level record is also catch-guarded so a non-object level value
  // (e.g. `choices: {1: null}` or `{1: "foo"}`) survives the parse instead
  // of failing the whole character.
  choices: z
    .record(
      z.coerce.number().int(),
      z.record(z.string(), choiceValueSchema).catch((ctx) => ctx.value as Record<string, never>), // type-only cast; value preserved at runtime
    )
    .default({}),
});

const spellOverrideSchema = z.object({
  slug: z.string().min(1),
  overrides: z.record(z.string(), z.unknown()).default({}),
});

const knownSpellObjectSchema = z.object({
  spell: z.string().min(1),
  class: z.string().optional(),
  source: z.enum(["class", "feat", "item", "race", "domain"]).optional(),
  prepared: z.boolean().optional(),
  always_prepared: z.boolean().optional(),
}).strict();

const knownSpellEntrySchema = z.union([z.string().min(1), knownSpellObjectSchema]);

export const characterSchema = z.object({
  name: z.string().min(1),
  edition: z.enum(["2014", "2024"]),
  // Builder-draft marker (SP2 Plan 3). NO default: absent on every existing
  // file and stays absent on save; present+true only while the file is an
  // unfinished Builder draft. Finish deletes the key (see finishBuild).
  builder: z.boolean().optional(),
  alignment: z.string().optional(),
  age: z.string().optional(),
  race: z.string().nullable().default(null),
  subrace: z.string().nullable().default(null),
  background: z.string().nullable().default(null),
  // Relaxed from .min(1) for build-in-progress drafts: the Builder is the only
  // producer of class-less files, and recalc degrades gracefully (HP/derivation
  // fall back with warnings) when no class is present. See SP2 spec §5/§9.
  class: z.array(classEntrySchema).default([]),
  // Race/background decision selections, keyed `race:<id>` / `background:<id>`
  // (SP2 Plan 3). Permissive value arm mirrors per-level class choices.
  origin_choices: z.record(z.string(), choiceValueSchema).default({}),
  abilities: z.object({
    str: z.number().int(),
    dex: z.number().int(),
    con: z.number().int(),
    int: z.number().int(),
    wis: z.number().int(),
    cha: z.number().int(),
  }),
  ability_method: z.enum(["standard-array", "point-buy", "archivist-point-buy", "rolled", "manual"]),
  // Persisted Roll-method ability pool (SP2 Plan 5). NO default — absent on
  // every existing/finished file and stays absent on save; present only while
  // the file is an unfinished Builder draft in `rolled` mode. Finish deletes
  // the key (see finishBuild). Permissive: a plain int array, no length pin
  // (re-rolls always write six, but legacy/hand-edited files may vary).
  builder_rolls: z.array(z.number().int()).optional(),
  // Persisted Equipment-step mode (SP2). NO default — absent on every
  // existing/finished file and stays absent on save; present only while the file
  // is an unfinished Builder draft. Finish deletes the key (see finishBuild).
  builder_equipment_mode: z.enum(["starting", "gold", "empty"]).optional(),
  skills: z.object({
    proficient: z.array(skillEnum).default([]),
    expertise: z.array(skillEnum).default([]),
  }).default({ proficient: [], expertise: [] }),
  spells: z.object({
    known: z.array(knownSpellEntrySchema).default([]),
    overrides: z.array(spellOverrideSchema).default([]),
    view: z.enum(["by-level", "table"]).optional(),
  }).default({ known: [], overrides: [] }),
  equipment: z.array(equipmentEntrySchema).default([]),
  overrides: characterOverridesSchema,
  currency: z.object({
    cp: z.number().int().nonnegative(),
    sp: z.number().int().nonnegative(),
    ep: z.number().int().nonnegative(),
    gp: z.number().int().nonnegative(),
    pp: z.number().int().nonnegative(),
  }).optional(),
  notes: z.string().optional(),
  defenses: z.object({
    resistances: z.array(z.string()).default([]),
    immunities: z.array(z.string()).default([]),
    vulnerabilities: z.array(z.string()).default([]),
    condition_immunities: z.array(z.string()).default([]),
  }).partial().optional(),
  state: characterStateSchema,
});

export type CharacterInput = z.input<typeof characterSchema>;
export type CharacterOutput = z.output<typeof characterSchema>;
