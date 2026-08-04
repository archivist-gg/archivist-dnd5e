// Committed corrective SRD data (R4-P4). Emitted through the normal generator
// feat pipeline · NO offline injection.
//
// The seed data, its type AND its builder all live HERE rather than in
// index.ts, because index.ts ends in a bare top-level `main().catch(...)`:
// importing any value from it EXECUTES the generator, which either
// process.exit(1)s (no STRUCTURED_RULES_PATH) or runs a full regeneration from
// inside a unit test. Keeping this module side-effect free (exactly like
// synthetic-armor-seeds.ts) is what lets the guard test import the builder.
import type { Choice } from "@archivist-gg/dnd5e/types/choice";
import { buildCanonicalSlug } from "../merger";

/**
 * Authored payload for one synthetic feat entity. Deliberately carries NO
 * `slug`: the slug is generator-owned and derived in
 * {@link buildSeedCanonicalFeat} via buildCanonicalSlug(edition, "feat", name).
 */
export type SyntheticFeatSeed = {
  name: string;
  source: string;
  category: "origin" | "general";
  description: string;
  benefits: string[];
  prerequisites: Array<{ kind: "level"; min: number }>;
  repeatable: boolean;
  choices: Choice[];
};

/**
 * SRD-5e (2014) ships no Ability Score Improvement feat entity · feats.2014.json
 * holds only Grappler. With the authored "asi-or-feat" shape flattened into a
 * plain feat pick (R4-P4), a 2014 character had nothing rules-honest to choose,
 * so this seeds the ASI entity the 2014 rules describe in class prose.
 *
 * Two deliberate choices, both recorded in the R4-P4 spec:
 *
 * - `benefits` is EMPTY on purpose. Writing 2014 benefit prose here would be
 *   unsourced invention, and the entity is invisible in the picker anyway.
 * - The entity IS invisible under the shipped defaults (`hiddenCompendiums`
 *   defaults to ["SRD 5e"], and the decision strip/modal both filter on
 *   entityCompendiumVisible). That is a knowing user ruling · spec §6.4, not an
 *   oversight.
 *
 * `prerequisites` uses only the `level` arm: prerequisiteSchema (feat.schema.ts)
 * has arms for ability/level/spellcaster/proficiency/race/class and none for
 * feat or spell.
 */
export const SYNTHETIC_FEAT_SEEDS: Record<string, SyntheticFeatSeed[]> = {
  "2014": [
    {
      name: "Ability Score Improvement",
      source: "SRD 5.1",
      category: "general",
      description: "",
      benefits: [],
      prerequisites: [{ kind: "level", min: 4 }],
      repeatable: true,
      choices: [{ kind: "ability-points", id: "asi", points: 2, max_per: 2 }],
    },
  ],
};

/**
 * Build the canonical feat record for one synthetic feat seed. Field set and
 * insertion order match toFeatCanonical (merger-rules/feat-merge.ts), so the
 * seeded entry reads identically to a pipeline-generated feat in
 * feats.{edition}.json, the runtime projection and the bundle MD. The generator
 * owns the derived `slug` and the `edition` stamp; everything else comes from
 * the seed. `effects` and `grants_asi` are the same schema-required defaults
 * toFeatCanonical emits when nothing is authored: the ability increase is
 * carried by the `ability-points` choice, not by `grants_asi`.
 *
 * All twelve featEntitySchema fields are required (none is `.optional()`), so
 * every one is emitted.
 */
export function buildSeedCanonicalFeat(
  seed: SyntheticFeatSeed,
  edition: "2014" | "2024",
): Record<string, unknown> {
  return {
    slug: buildCanonicalSlug(edition, "feat", seed.name),
    name: seed.name,
    edition,
    source: seed.source,
    description: seed.description,
    category: seed.category,
    prerequisites: seed.prerequisites,
    benefits: seed.benefits,
    repeatable: seed.repeatable,
    effects: [],
    grants_asi: null,
    choices: seed.choices,
  };
}
