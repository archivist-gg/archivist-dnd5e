import type { Abilities } from "./abilities";
import type { FeatureEffect } from "./feature-effect";

export type Ability = keyof Abilities;

export type SkillSlug =
  | "acrobatics" | "animal-handling" | "arcana" | "athletics" | "deception"
  | "history" | "insight" | "intimidation" | "investigation" | "medicine"
  | "nature" | "perception" | "performance" | "persuasion" | "religion"
  | "sleight-of-hand" | "stealth" | "survival";

export const ALL_SKILL_SLUGS: SkillSlug[] = [
  "acrobatics", "animal-handling", "arcana", "athletics", "deception",
  "history", "insight", "intimidation", "investigation", "medicine",
  "nature", "perception", "performance", "persuasion", "religion",
  "sleight-of-hand", "stealth", "survival",
];

/** The SRD language set: 8 standard + 8 exotic. Authoritative and reused as
 *  KNOWN_LANGUAGES by the proficiency aggregate; slugs are edition-agnostic. */
export const STANDARD_LANGUAGES: string[] = [
  "common", "dwarvish", "elvish", "giant", "gnomish", "goblin", "halfling", "orc",
];
export const EXOTIC_LANGUAGES: string[] = [
  "abyssal", "celestial", "deep-speech", "draconic", "infernal", "primordial",
  "sylvan", "undercommon",
];
export const ALL_LANGUAGES: string[] = [...STANDARD_LANGUAGES, ...EXOTIC_LANGUAGES];

/** The SRD tool set: 17 artisan's tools + 10 musical instruments + 2 gaming sets
 *  + 6 other tools = 35. Like ALL_LANGUAGES this is a SINGLE edition-agnostic
 *  list covering 2014 and 2024, and where the two editions name the same tool
 *  differently the 2024 name wins. Across all 35 entries there is exactly one
 *  such delta: `Playing Card Set` (2014) vs `Playing Cards` (2024), resolved
 *  here to "playing-cards".
 *
 *  Apostrophes are RETAINED ("thieves'-tools", "calligrapher's-supplies").
 *  These are the slugs the product already emits · see
 *  `tools/srd-canonical/merger-rules/background-merge.ts`, whose output is live
 *  in `background.2024.json` · and humanizeProficiency is apostrophe-safe.
 *  Stripping the apostrophes would diverge from that live data and CREATE the
 *  collision it would claim to avoid.
 *
 *  Every entry is already canonical under toProfSlug (identity) and the set is
 *  collision-free under it. Ordering is alphabetical within each subset, and
 *  ALL_TOOLS composes the four subsets in that order, mirroring
 *  ALL_LANGUAGES = STANDARD + EXOTIC. The list is a cross-repo contract: a
 *  one-entry divergence is silent and permanent, so it is pinned verbatim. */
export const ARTISANS_TOOLS: string[] = [
  "alchemist's-supplies", "brewer's-supplies", "calligrapher's-supplies", "carpenter's-tools",
  "cartographer's-tools", "cobbler's-tools", "cook's-utensils", "glassblower's-tools", "jeweler's-tools",
  "leatherworker's-tools", "mason's-tools", "painter's-supplies", "potter's-tools", "smith's-tools",
  "tinker's-tools", "weaver's-tools", "woodcarver's-tools",
];                                                                                    // 17
export const MUSICAL_INSTRUMENTS: string[] = [
  "bagpipes", "drum", "dulcimer", "flute", "horn", "lute", "lyre", "pan-flute", "shawm", "viol",
];                                                                                    // 10
export const GAMING_SETS: string[] = ["dice-set", "playing-cards"];                   //  2
export const OTHER_TOOLS: string[] = [
  "disguise-kit", "forgery-kit", "herbalism-kit", "navigator's-tools", "poisoner's-kit", "thieves'-tools",
];                                                                                    //  6
export const ALL_TOOLS: string[] = [
  ...ARTISANS_TOOLS, ...MUSICAL_INSTRUMENTS, ...GAMING_SETS, ...OTHER_TOOLS,
];                                                                                    // 35

export type FeatCategory = "origin" | "general" | "fighting-style" | "epic-boon";

/** Closed, enumerated registry filter — YAML can never express a query the
 *  engine would apply unsafely. `"self"` resolves against the owning
 *  class/subclass at ledger-build time. */
export interface EntityFilter {
  feature_type?: string;     // optional-feature kind: invocation | metamagic | fighting_style | ...
  category?: string;         // feat category
  parent_class?: "self";
  available_to?: "self";
  /** Weapon proficiency class. Matched against a weapon entity's compound
   *  `category` (e.g. "martial-melee") by prefix, so "martial" covers both
   *  martial-melee and martial-ranged. */
  weapon_category?: "simple" | "martial";
  /** Armor proficiency class. Matched against an armor entity's `category`
   *  field exactly; "shield" selects shields. */
  armor_category?: "light" | "medium" | "heavy" | "shield";
  /** Spell axis: filter spells by class list, level, and edition. Set together on a
   *  select-entity{entity_type:"spell"} choice (e.g. Magic Initiate). */
  list?: string;      // spell class list, matched against a spell entity's `classes[]`
  level?: number;     // exact spell level (0 = cantrip)
  edition?: string;   // "2014" | "2024"; prevents cross-edition duplicate options
}

export interface InlineOption {
  value: string;
  label: string;
  description?: string;
  /** Applied via a synthesized resolved feature when the option is selected. */
  effects?: FeatureEffect[];
  /** Nested decisions revealed when this option is selected (recursive). */
  choices?: Choice[];
}

/** The four game-agnostic decision primitives. All game knowledge (which
 *  options, which counts) lives in data — authored in the SRD overlay or
 *  inline in homebrew entity notes. `id` is the persistence key under
 *  `ClassEntry.choices[level]` / `Character.origin_choices`. */
export type Choice =
  | { kind: "select-inline"; id: string; label?: string; count?: number; options: InlineOption[] }
  | {
      kind: "select-entity"; id: string; label?: string; count?: number;
      entity_type: string; from?: string[]; where?: EntityFilter;
    }
  | {
      kind: "select-proficiency"; id: string; label?: string; count: number;
      domain: "skill" | "tool" | "language" | "save";
      from?: string[]; from_proficient?: boolean; expertise?: boolean;
    }
  | { kind: "ability-points"; id: string; label?: string; points: number; max_per: number; pool?: Ability[] };
