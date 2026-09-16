import { z } from "zod";
import { featureEffectSchema } from "@archivist-gg/dnd5e/schemas/feature-effect-schema";
import {
  resetTriggerEnum,
  actionCostEnum,
  resourceConsumptionSchema,
} from "@archivist-gg/dnd5e/schemas/resource-schema";
import { durationSchema } from "@archivist-gg/dnd5e/schemas/duration-schema";
import { imageField, additionalSpellsEntrySchema, progressionSchema }
  from "@archivist-gg/dnd5e/schemas/entity-extras-schema";

const editionEnum = z.enum(["2014", "2024"]);
const abilityEnum = z.enum(["str", "dex", "con", "int", "wis", "cha"]);
const wikilinkRegex = /^\[\[[^[\]]+\]\]$/;

// A class/subclass named reference on a level prerequisite. Non-strict: the converter may
// carry further 5etools keys, and stripping them is preferable to refusing the document.
const namedRefSchema = z.object({ name: z.string().min(1), source: z.string().min(1).optional(), visible_stats: z.boolean().optional() });

// Discriminated union mirrors OptionalFeaturePrerequisite in optional-feature.types.ts.
const prerequisiteSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("level"), min: z.number().int().positive(), class: namedRefSchema.optional(), subclass: namedRefSchema.optional() }),
  z.object({ kind: z.literal("spell-known"), spell: z.string().regex(wikilinkRegex) }),
  z.object({ kind: z.literal("pact"), pact: z.enum(["tome", "blade", "chain", "talisman"]) }),
  z.object({ kind: z.literal("class"), class: z.string().regex(wikilinkRegex) }),
  z.object({ kind: z.literal("ability"), ability: abilityEnum, min: z.number().int().positive() }),
  z.object({ kind: z.literal("other"), detail: z.string() }),
  z.object({ kind: z.literal("optionalfeature"), optionalfeature: z.string().regex(wikilinkRegex) }),
  z.object({ kind: z.literal("spell-choose"), choose: z.string().min(1), entry: z.string().optional(), entry_summary: z.string().optional() }),
]);

const usesSchema = z.object({
  max: z.union([z.number(), z.string()]),
  recharge: resetTriggerEnum,
  /** Partial recovery, for a pool a rest does NOT fully refill (a sanity track that regains 1 per long
   *  rest). Same shape a feature's `resources[].recovery` uses, so `ResolvedResource.recovery` — which
   *  has carried the field since R4-G4 — is populated identically from either side. Optional: all 35
   *  shipped `uses` carriers omit it and parse unchanged. */
  recovery: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    amount: z.union([z.number(), z.string()]),
    reset: resetTriggerEnum,
    restores: z.enum(["uses", "spell-slots"]).optional(),
  })).optional(),
});

export const optionalFeatureEntitySchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  edition: editionEnum,
  source: z.string().min(1),
  feature_type: z.string().min(1),
  description: z.string(),
  prerequisites: z.array(prerequisiteSchema),
  available_to: z.array(z.string().regex(wikilinkRegex)),
  effects: z.array(featureEffectSchema),
  action_cost: actionCostEnum.nullable().optional(),
  uses: usesSchema.nullable().optional(),
  consumes: resourceConsumptionSchema.nullable().optional(),
  duration: durationSchema.nullable().optional(),
  passive: z.boolean().optional(),
  // Phase 3 activatable buffs: an activatable boon folds its effects only while
  // its slug is present in state.active_buffs (toggled in the PoolTab).
  activatable: z.boolean().optional(),
  rendering_hint: z.string().optional(),        // the ONE root with load-bearing VALUES (88 records, G4's)
  /** WHERE this resource is drawn. `band` puts it in the header strip beside HP; anything else, and the
   *  default, leaves it to the Resources tab. The tab ALWAYS lists every resource — it is the complete
   *  inventory of what the character can spend, and a row missing from it would read as a bug — so this
   *  key only ever ADDS a second, curated home. Opt-in on purpose: the band's whole value is being short,
   *  which an opt-out flag would erode one new grant at a time. */
  surface: z.enum(["band", "tab"]).optional(),
  additional_spells: z.array(additionalSpellsEntrySchema).optional(),   // 54
  is_class_feature_variant: z.boolean().optional(),                     // 25
  has_fluff_images: z.boolean().optional(),                             // 2
  feat_progression: z.array(progressionSchema).optional(),              // 1
  optionalfeature_progression: z.array(progressionSchema).optional(),   // 1
  image: imageField,
});

export type OptionalFeatureSchemaInput = z.input<typeof optionalFeatureEntitySchema>;
export type OptionalFeatureSchemaOutput = z.output<typeof optionalFeatureEntitySchema>;
