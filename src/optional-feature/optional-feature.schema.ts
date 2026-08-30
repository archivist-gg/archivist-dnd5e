import { z } from "zod";
import { featureEffectSchema } from "@archivist-gg/dnd5e/schemas/feature-effect-schema";
import {
  resetTriggerEnum,
  actionCostEnum,
  resourceConsumptionSchema,
} from "@archivist-gg/dnd5e/schemas/resource-schema";
import { durationSchema } from "@archivist-gg/dnd5e/schemas/duration-schema";

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
});

export type OptionalFeatureSchemaInput = z.input<typeof optionalFeatureEntitySchema>;
export type OptionalFeatureSchemaOutput = z.output<typeof optionalFeatureEntitySchema>;
