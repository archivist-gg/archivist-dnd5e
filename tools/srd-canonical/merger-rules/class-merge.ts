import type { MergeRule, CanonicalEntry } from "../merger";
import type { Overlay } from "../overlay.schema";
import { rewriteCrossRefs } from "../cross-ref-map";
import { slugifyName } from "../sources/slug-normalize";
import type { Resource } from "@archivist-gg/dnd5e/types/resource";
import type { Choice } from "@archivist-gg/dnd5e/types/choice";
import type { StartingEquipmentEntry, StartingGold } from "@archivist-gg/dnd5e/types/equipment-grant";
// CasterType is declared ONCE in schemas/caster-type-schema.ts; CASTER_TYPE_MAP reads it. Never redeclare it.
import type { CasterType } from "@archivist-gg/dnd5e/schemas/caster-type-schema";

/**
 * ClassCanonical mirrors the runtime ClassEntity shape (packages/dnd5e/src/class/class.schema.ts)
 * so the emitted YAML in `.compendium-bundle/SRD 5e/Classes/*.md` parses through
 * `parseClass` without a translation layer.
 */
export interface ClassCanonical {
  slug: string;
  name: string;
  edition: "2014" | "2024";
  source: string;
  description: string;
  hit_die: "d6" | "d8" | "d10" | "d12";
  primary_abilities: Ability[];
  saving_throws: Ability[];
  proficiencies: ClassProficiencies;
  skill_choices: { count: number; from: SkillSlug[] };
  /** Entity-level decisions, mirroring `ClassEntity.choices`. */
  choices?: Choice[];
  starting_equipment: StartingEquipmentEntry[];
  starting_gold?: StartingGold;
  spellcasting: SpellcastingConfig | null;
  subclass_level: number;
  subclass_feature_name: string;
  weapon_mastery: WeaponMasteryConfig | null;
  epic_boon_level: number | null;
  table: Record<string, ClassTableRow>;
  features_by_level: Record<string, ClassFeatureOut[]>;
  resources: ResourceOut[];
}

type Ability = "str" | "dex" | "con" | "int" | "wis" | "cha";
type SkillSlug =
  | "acrobatics" | "animal-handling" | "arcana" | "athletics" | "deception"
  | "history" | "insight" | "intimidation" | "investigation" | "medicine"
  | "nature" | "perception" | "performance" | "persuasion" | "religion"
  | "sleight-of-hand" | "stealth" | "survival";
type ArmorCategory = "light" | "medium" | "heavy" | "shield";
type WeaponCategory = "simple" | "martial";

interface ClassProficiencies {
  armor: ArmorCategory[];
  weapons: { fixed?: string[]; categories?: WeaponCategory[] };
  tools?: { fixed: string[] };
}

interface SpellcastingConfig {
  caster_type: CasterType;
  ability: Ability;
  preparation: "known" | "prepared";
  spell_list: string;
}

interface WeaponMasteryConfig {
  /** OPTIONAL since R4-G1b (§2.7, finding 11): a COPY of class.types.ts's interface, not an import —
   *  leaving it required here is the recorded silent divergence. Declaration 3 of 3. */
  starting_count?: number;
  scaling?: Record<string, number>;
}

interface ClassTableRow {
  prof_bonus: number;
  columns?: Record<string, string | number>;
  feature_ids: string[];
}

/**
 * Class feature emitted into features_by_level. Carries the standard
 * Feature shape (id/name/description) plus optional overlay fields.
 */
export interface ClassFeatureOut {
  id?: string;
  name: string;
  description: string;
  action?: "action" | "bonus-action" | "reaction" | "free" | "special";
  resources?: Resource[];
  choices?: Choice[];
}

interface ResourceOut {
  id: string;
  name: string;
  max_formula: string;
  reset: "short-rest" | "long-rest" | "dawn" | "dusk" | "turn" | "round" | "custom";
}

export const classMergeRule: MergeRule = {
  kind: "class",
  pickOverlay(overlay: Overlay, _slug: string): unknown {
    // Feature map is keyed by feature-slug (optionally class-scoped
    // "<class>:<feature>"); classes carries entity-level overrides
    // (skill_choices / starting_equipment / subclass_level / subclass_feature_name).
    // toClassCanonical unpacks both sections.
    return { class_features: overlay.class_features ?? null, classes: overlay.classes ?? null };
  },
};

// ---------------------------------------------------------------------------
// Open5e v2 class shape (subset we read).
// ---------------------------------------------------------------------------

interface Open5eClassFeature {
  key: string;
  name: string;
  desc: string;
  /**
   * Open5e enum values include CLASS_LEVEL_FEATURE, CORE_TRAITS_TABLE,
   * CLASS_TABLE_DATA, PROFICIENCY_BONUS, SPELL_SLOTS, STARTING_EQUIPMENT,
   * PROFICIENCIES. We type this as a plain string so future Open5e additions
   * don't break compilation; the merger checks specific values explicitly.
   */
  feature_type: string;
  gained_at: Array<{ level: number; detail: string | null }>;
  data_for_class_table: Array<{ level: number; column_value: string }>;
}

interface Open5eClassBase {
  key: string;
  name: string;
  desc?: string;
  hit_dice?: string;
  subclass_of?: { key: string; name: string } | null;
  caster_type?: string | null;
  primary_abilities?: string[];
  saving_throws?: Array<{ name: string }>;
  features?: Open5eClassFeature[];
  hit_points?: { hit_dice?: string };
}

// ---------------------------------------------------------------------------
// Lookup tables (mirror src/modules/class/class.normalizer.ts).
// ---------------------------------------------------------------------------

const ABILITY_NAME_TO_SLUG: Record<string, Ability> = {
  strength: "str",
  dexterity: "dex",
  constitution: "con",
  intelligence: "int",
  wisdom: "wis",
  charisma: "cha",
  str: "str", dex: "dex", con: "con", int: "int", wis: "wis", cha: "cha",
};

const PRIMARY_ABILITIES_BY_SLUG: Record<string, Ability[]> = {
  barbarian: ["str"],
  bard: ["cha"],
  cleric: ["wis"],
  druid: ["wis"],
  fighter: ["str", "dex"],
  monk: ["dex", "wis"],
  paladin: ["str", "cha"],
  ranger: ["dex", "wis"],
  rogue: ["dex"],
  sorcerer: ["cha"],
  warlock: ["cha"],
  wizard: ["int"],
  artificer: ["int"],
};

const ALL_SKILL_SLUGS: SkillSlug[] = [
  "acrobatics", "animal-handling", "arcana", "athletics", "deception",
  "history", "insight", "intimidation", "investigation", "medicine",
  "nature", "perception", "performance", "persuasion", "religion",
  "sleight-of-hand", "stealth", "survival",
];

const SPELLCASTING_ABILITY_BY_SLUG: Record<string, Ability> = {
  bard: "cha",
  cleric: "wis",
  druid: "wis",
  paladin: "cha",
  ranger: "wis",
  sorcerer: "cha",
  warlock: "cha",
  wizard: "int",
  artificer: "int",
};

// Open5e caster_type strings → canonical caster_type. (SRD casters are authored
// via overlays; this is a best-effort fallback for any caster lacking an overlay.)
const CASTER_TYPE_MAP: Record<string, CasterType | undefined> = {
  FULL: "full",
  HALF: "half",
  THIRD: "third",
  PACT: "pact",
};

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

function normalizeHitDie(raw: string | undefined | null): "d6" | "d8" | "d10" | "d12" {
  const m = /d(6|8|10|12)/i.exec(raw ?? "");
  if (!m) {
    // Schema requires one of the four; default to d8 for unknown shapes so we
    // don't crash structural validation on malformed sources.
    return "d8";
  }
  return `d${m[1]}` as "d6" | "d8" | "d10" | "d12";
}

function parseSavingThrows(raw: Array<{ name: string }> | undefined): Ability[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s) => ABILITY_NAME_TO_SLUG[s.name?.toLowerCase?.() ?? ""])
    .filter((a): a is Ability => a !== undefined);
}

function deriveClassNameSlug(canonicalSlug: string, name: string): string {
  // canonicalSlug is `srd-5e_<slugifiedname>`; strip the prefix when present
  // (delegates the prefix-strip to bareSlug, then lower-cases). Falls back to
  // the slugified display name when there is no prefix to strip.
  if (canonicalSlug.indexOf("_") >= 0) return bareSlug(canonicalSlug).toLowerCase();
  return slugifyName(name);
}

function resolvePrimaryAbilities(canonicalSlug: string, name: string, savingThrows: Ability[]): Ability[] {
  const nameSlug = deriveClassNameSlug(canonicalSlug, name);
  const byLookup = PRIMARY_ABILITIES_BY_SLUG[nameSlug];
  if (byLookup && byLookup.length > 0) return byLookup;
  if (savingThrows.length > 0) return [savingThrows[0]];
  return ["str"];
}

function clampSavingThrows(saves: Ability[]): Ability[] {
  // Schema requires exactly two. If we have more or fewer, pad/trim with safe
  // defaults so structural validation passes.
  if (saves.length === 2) return saves;
  if (saves.length > 2) return saves.slice(0, 2);
  const padded = [...saves];
  const fallback: Ability[] = ["str", "con", "dex", "wis", "int", "cha"];
  for (const a of fallback) {
    if (padded.length >= 2) break;
    if (!padded.includes(a)) padded.push(a);
  }
  return padded.slice(0, 2);
}

/**
 * A tool "proficiency" that is really a CHOICE the player makes at character
 * creation ("Three musical instruments of your choice", "Choose 3 Musical
 * Instruments"). Same vocabulary as background-merge's `parseToolProf`; the
 * PLACEMENT differs, see the call site. No `g` flag: `test()` must not carry
 * `lastIndex` between items.
 */
const TOOL_CHOICE_PROSE = /\b(choose|of your choice|one kind of)\b/i;

function parseProficienciesProse(features: Open5eClassFeature[]): {
  proficiencies: ClassProficiencies;
  skill_choices: { count: number; from: SkillSlug[] };
} {
  // Two upstream shapes carry the same class proficiency data:
  //   • 2014: a PROFICIENCIES prose feature — `**Armor:** …` / `**Weapons:** …`.
  //   • 2024: a CORE_TRAITS_TABLE markdown table — `|Armor Training|…|` /
  //     `|Weapon Proficiencies|…|` (2024 has NO PROFICIENCIES feature).
  // Prose wins when present so 2014 output stays byte-identical; the 2024 table
  // only fills a field the prose feature leaves empty.
  const proseDesc = features.find((f) => f.feature_type === "PROFICIENCIES")?.desc ?? "";
  const tableDesc = features.find((f) => f.feature_type === "CORE_TRAITS_TABLE")?.desc ?? "";

  // 2014 prose: `**<Label>:**  <value up to EOL>`.
  const proseRegex = (label: string) =>
    new RegExp(`\\*\\*${label}:\\*\\*\\s*([^\\n\\r]+)`, "i");
  // 2024 table row: `|<Label>|<value>|` (value = up to the next pipe).
  const tableRegex = (label: string) =>
    new RegExp(`\\|\\s*${label}\\s*\\|\\s*([^|\\r\\n]+?)\\s*\\|`, "i");
  // Read a labelled value from EITHER source, preferring the 2014 prose; the
  // 2024 alias (Armor→Armor Training, Weapons→Weapon Proficiencies, …) supplies
  // the value only when the prose field is absent/empty.
  const grab = (proseLabel: string, tableLabel: string): string => {
    const proseMatch = proseRegex(proseLabel).exec(proseDesc);
    if (proseMatch && proseMatch[1].trim()) return proseMatch[1].trim();
    const tableMatch = tableRegex(tableLabel).exec(tableDesc);
    return tableMatch ? tableMatch[1].trim() : "";
  };

  const armorRaw = grab("Armor", "Armor Training").toLowerCase();
  const weaponsRaw = grab("Weapons", "Weapon Proficiencies").toLowerCase();
  const toolsRaw = grab("Tools", "Tool Proficiencies");
  const skillsRaw = grab("Skills", "Skill Proficiencies");

  const armor: ArmorCategory[] = [];
  if (armorRaw.includes("light")) armor.push("light");
  if (armorRaw.includes("medium")) armor.push("medium");
  if (armorRaw.includes("heavy")) armor.push("heavy");
  if (armorRaw.includes("shield")) armor.push("shield");
  // "All armor" → light+medium+heavy.
  if (armorRaw.includes("all armor") && !armor.includes("light")) {
    armor.push("light", "medium", "heavy");
  }

  const weapons: ClassProficiencies["weapons"] = {};
  const wparts = weaponsRaw.split(",").map((s) => s.trim()).filter(Boolean);
  // Detect weapon CATEGORIES by word-boundary anywhere in the raw string, so
  // both "Simple and Martial weapons" (2024, no comma) and "Simple weapons,
  // martial weapons" (2014) resolve to [simple, martial]. The conditional 2024
  // phrasings ("Simple weapons and Martial weapons that have the Light/Finesse
  // property", Monk/Rogue) also match — a DOCUMENTED over-grant, since
  // ClassProficiencies has no conditional-weapon axis.
  const wcategories: WeaponCategory[] = [];
  if (/\bsimple\b/.test(weaponsRaw)) wcategories.push("simple");
  if (/\bmartial\b/.test(weaponsRaw)) wcategories.push("martial");
  // Preserve the specific-weapon path for 2014 casters (daggers, darts, …): any
  // comma-separated part that is NOT a category phrase is a fixed weapon.
  const wfixed: string[] = [];
  for (const p of wparts) {
    if (/\bsimple\b/.test(p) || /\bmartial\b/.test(p)) continue; // category phrase, already handled
    if (p && p !== "none") wfixed.push(p);
  }
  if (wcategories.length > 0) weapons.categories = wcategories;
  if (wfixed.length > 0) weapons.fixed = wfixed;
  // Schema refines that weapons must declare at least one of fixed/categories/
  // conditional. This fallback now fires ONLY when there is genuinely no
  // proficiency data (neither PROFICIENCIES prose nor a CORE_TRAITS_TABLE row).
  if (!weapons.categories && !weapons.fixed) {
    weapons.fixed = ["unarmed"];
  }

  const result: ClassProficiencies = { armor, weapons };
  const toolsClean = toolsRaw.replace(/none\.?$/i, "").trim();
  if (toolsClean.length > 0) {
    // Filter PER ITEM, after the comma split: a mixed grant ("Thieves' tools,
    // choose one artisan's tool") must keep its real fixed half while the choice
    // half is dropped. This deliberately DIVERGES from background-merge's
    // `parseToolProf`, which returns null for the whole string · a background
    // block carries one homogeneous grant, whereas a class Tools line can carry
    // both kinds at once.
    // The dropped half is not lost: the real pick is authored as an overlay
    // `choices` entry (Bard/Monk). Without this filter the prose lands verbatim
    // in `tools.fixed` and the sheet shows a fake fixed proficiency literally
    // named "Three musical instruments of your choice".
    const fixed = toolsClean
      .split(",")
      .map((s) => s.trim().replace(/\.$/, ""))
      .filter(Boolean)
      .filter((s) => !TOOL_CHOICE_PROSE.test(s));
    if (fixed.length > 0) result.tools = { fixed };
  }

  const skill_choices = parseSkillChoices(skillsRaw);

  return { proficiencies: result, skill_choices };
}

function parseSkillChoices(raw: string): { count: number; from: SkillSlug[] } {
  const fallback = { count: 2, from: ALL_SKILL_SLUGS };
  if (!raw) return fallback;
  const wordToNum: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  };
  const m = /choose\s+(?:any\s+)?(\w+)/i.exec(raw);
  let count = 0;
  if (m) {
    const w = m[1].toLowerCase();
    const fromWord = wordToNum[w];
    const fromDigit = Number.parseInt(w, 10);
    count = fromWord ?? (Number.isFinite(fromDigit) ? fromDigit : 0);
  }

  const SKILL_LOOKUP: Record<string, SkillSlug> = {
    "acrobatics": "acrobatics",
    "animal handling": "animal-handling",
    "arcana": "arcana",
    "athletics": "athletics",
    "deception": "deception",
    "history": "history",
    "insight": "insight",
    "intimidation": "intimidation",
    "investigation": "investigation",
    "medicine": "medicine",
    "nature": "nature",
    "perception": "perception",
    "performance": "performance",
    "persuasion": "persuasion",
    "religion": "religion",
    "sleight of hand": "sleight-of-hand",
    "stealth": "stealth",
    "survival": "survival",
  };
  const lower = raw.toLowerCase();
  const from: SkillSlug[] = [];
  for (const [name, slug] of Object.entries(SKILL_LOOKUP)) {
    if (lower.includes(name)) from.push(slug);
  }
  if (from.length === 0) return { count: count > 0 ? count : 2, from: ALL_SKILL_SLUGS };
  return { count: count > 0 ? count : 2, from };
}

function parseStartingEquipment(features: Open5eClassFeature[]): StartingEquipmentEntry[] {
  const eq = features.find((f) => f.feature_type === "STARTING_EQUIPMENT");
  if (!eq?.desc) return [];
  const items: string[] = [];
  for (const line of eq.desc.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("*")) continue;
    const cleaned = trimmed.replace(/^\*\s*/, "").trim();
    if (cleaned.length > 0) items.push(cleaned);
  }
  if (items.length === 0) return [];
  // Prose fallback: preserve the lines for DISPLAY only (grants empty → seeds
  // nothing). SRD classes are fully authored in the overlay, which overrides
  // this; only un-annotated homebrew falls here.
  return [{ kind: "fixed", label: items.join(", "), grants: [] }];
}

/**
 * Per-feature overlay record applied to an emitted feature. Keyed in the
 * overlay map by feature-slug or class-scoped "<class>:<feature>" slug.
 * Exported so subclass-merge (Task 7) shares the same shape.
 */
export type FeatureOverlayMap = Record<
  string,
  {
    // The overlay authors action economy under `action_cost` (overlay.schema
    // featureOverrideSchema); it is emitted onto the feature's `action` field.
    action_cost?: ClassFeatureOut["action"];
    resources?: Resource[];
    choices?: Choice[];
  }
>;

/**
 * Entity-level class override (mirrors overlay.schema classOverrideSchema):
 * pulled from the overlay `classes:` section, keyed by bare class-slug.
 */
export interface ClassOverride {
  skill_choices?: { count: number; from: SkillSlug[] };
  starting_equipment?: StartingEquipmentEntry[];
  starting_gold?: StartingGold;
  subclass_level?: number;
  subclass_feature_name?: string;
  spellcasting?: SpellcastingConfig;
  choices?: Choice[];
}

/**
 * Owner bare slug for overlay keys (overlay keys use vendor-free bare slugs).
 * Arity-robust: type-namespaced slugs are 3-part `<prefix>_<type>_<name>`, so
 * `srd-2024_class_fighter` → `fighter`; legacy 2-part `srd-2024_fighter` → `fighter`;
 * bare `fighter` → `fighter`. Name-slugs never contain `_`, so `slice(2).join("_")`
 * is the unambiguous bare name for 3-part slugs.
 */
export function bareSlug(slug: string): string {
  const p = slug.split("_");
  return p.length >= 3 ? p.slice(2).join("_") : p[p.length - 1];
}

export function lookupFeatureOverlay<T>(
  map: Record<string, T> | null,
  ownerBareSlug: string,
  featureSlug: string,
): T | undefined {
  return map?.[`${ownerBareSlug}:${featureSlug}`] ?? map?.[featureSlug];
}

interface SubclassFeatureHint {
  /** Resolved subclass-grant level (e.g. 3) used to bucket the subclass feature. */
  level: number;
  /** Resolved subclass feature display name (e.g. "Bard Subclass"). */
  name: string;
}

function bucketFeaturesByLevel(
  features: Open5eClassFeature[],
  edition: "2014" | "2024",
  overlay: FeatureOverlayMap | null,
  ownerBareSlug: string,
  subclassHint: SubclassFeatureHint | null,
): { features_by_level: Record<string, ClassFeatureOut[]>; idsByLevel: Map<number, string[]> } {
  const out: Record<string, ClassFeatureOut[]> = {};
  const idsByLevel = new Map<number, string[]>();

  // The subclass-grant feature ("<Class> Subclass") is identified by matching
  // the resolved subclass_feature_name or the `<class>-subclass` slug. When the
  // upstream base data omits its gained_at level (a known data gap for some
  // classes, e.g. 2024 Bard), we bucket it at the class's subclass_level so it
  // lands in features_by_level / the progression table like every sibling class.
  const subclassSlug = subclassHint ? slugifyName(subclassHint.name) : null;
  const isSubclassFeature = (featureSlug: string, featureName: string): boolean => {
    if (!subclassHint) return false;
    return featureSlug === subclassSlug
      || featureSlug === `${ownerBareSlug}-subclass`
      || featureName === subclassHint.name;
  };

  const KEEP_TYPES = new Set(["CLASS_LEVEL_FEATURE", "CORE_TRAITS_TABLE"]);
  for (const f of features) {
    if (!KEEP_TYPES.has(f.feature_type)) continue;
    const featureSlug = slugifyName(f.name);
    const overlaid = lookupFeatureOverlay(overlay, ownerBareSlug, featureSlug);
    const description = rewriteCrossRefs(f.desc ?? "", edition);
    const desc = description && description.length > 0 ? description : f.name;
    let levels = (f.gained_at ?? []).map((g) => g.level).filter((n) => Number.isFinite(n));
    // Backfill the subclass feature's level from subclass_level when the base
    // data carries no gained_at (otherwise it would never bucket and the L3
    // progression cell would render "—").
    if (levels.length === 0 && isSubclassFeature(featureSlug, f.name)) {
      levels = [subclassHint!.level];
    }
    const seen = new Set<number>();
    for (const lvl of levels) {
      if (seen.has(lvl)) continue;
      seen.add(lvl);
      const feature: ClassFeatureOut = {
        id: featureSlug,
        name: f.name,
        description: desc,
        ...(overlaid?.action_cost ? { action: overlaid.action_cost } : {}),
        ...(overlaid?.resources ? { resources: overlaid.resources } : {}),
        ...(overlaid?.choices ? { choices: overlaid.choices } : {}),
      };
      const key = String(lvl);
      out[key] ??= [];
      out[key].push(feature);
      const ids = idsByLevel.get(lvl) ?? [];
      ids.push(featureSlug);
      idsByLevel.set(lvl, ids);
    }
  }

  return { features_by_level: out, idsByLevel };
}

function buildTable(
  features: Open5eClassFeature[],
  idsByLevel: Map<number, string[]>,
): Record<string, ClassTableRow> {
  // Collect unique levels referenced by feature gains and column data.
  const levels = new Set<number>();
  for (const lvl of idsByLevel.keys()) levels.add(lvl);

  // Find the dedicated proficiency-bonus column (when present) and any
  // additional class-table columns.
  const profFeature = features.find((f) => f.feature_type === "PROFICIENCY_BONUS");
  const columnFeatures = features.filter(
    (f) => Array.isArray(f.data_for_class_table) && f.data_for_class_table.length > 0
      && f.feature_type !== "PROFICIENCY_BONUS",
  );

  for (const cf of columnFeatures) {
    for (const row of cf.data_for_class_table) {
      if (Number.isFinite(row.level)) levels.add(row.level);
    }
  }
  if (profFeature) {
    for (const row of profFeature.data_for_class_table ?? []) {
      if (Number.isFinite(row.level)) levels.add(row.level);
    }
  }

  // Default progression — kept tight so we always emit a valid prof_bonus
  // when Open5e omits the PROFICIENCY_BONUS feature.
  const defaultProf = (lvl: number): number => {
    if (lvl <= 4) return 2;
    if (lvl <= 8) return 3;
    if (lvl <= 12) return 4;
    if (lvl <= 16) return 5;
    return 6;
  };

  // Index proficiency-bonus values by level.
  const profByLevel = new Map<number, number>();
  if (profFeature) {
    for (const row of profFeature.data_for_class_table ?? []) {
      const m = /([+-]?\d+)/.exec(row.column_value ?? "");
      if (m) profByLevel.set(row.level, Number(m[1]));
    }
  }

  const result: Record<string, ClassTableRow> = {};
  const sortedLevels = [...levels].sort((a, b) => a - b);
  if (sortedLevels.length === 0) {
    // Always at least produce level 1 so the schema has a non-empty record.
    sortedLevels.push(1);
  }
  for (const lvl of sortedLevels) {
    const prof_bonus = profByLevel.get(lvl) ?? defaultProf(lvl);
    const columns: Record<string, string | number> = {};
    for (const cf of columnFeatures) {
      const cell = cf.data_for_class_table.find((r) => r.level === lvl);
      if (cell) columns[cf.name] = cell.column_value;
    }
    const feature_ids = idsByLevel.get(lvl) ?? [];
    const row: ClassTableRow = {
      prof_bonus: Math.max(1, prof_bonus),
      feature_ids,
    };
    if (Object.keys(columns).length > 0) row.columns = columns;
    result[String(lvl)] = row;
  }

  return result;
}

function buildSpellcasting(
  base: Open5eClassBase,
  canonicalSlug: string,
  structured: Record<string, unknown> | null,
  overlaySc?: SpellcastingConfig,
): SpellcastingConfig | null {
  // Authored overlay wins — the single source of truth for SRD caster config.
  if (overlaySc) return { ...overlaySc };

  const nameSlug = deriveClassNameSlug(canonicalSlug, base.name);
  const ability = SPELLCASTING_ABILITY_BY_SLUG[nameSlug];
  const rawCaster = (base.caster_type ?? "").toUpperCase();
  const caster_type = CASTER_TYPE_MAP[rawCaster];
  const isCaster = ability !== undefined && rawCaster !== "" && rawCaster !== "NONE" && caster_type !== undefined;
  if (!isCaster || !ability || !caster_type) return null;

  // Fallback (no overlay authored). Only known|prepared survive the narrowed
  // schema; everything is best-effort and superseded by overlays for SRD.
  if (structured && typeof (structured as { spellcasting?: unknown }).spellcasting === "object") {
    const sc = (structured as { spellcasting: { ability?: string; preparation?: string; spell_list?: string } }).spellcasting;
    const rawAbility = sc.ability?.toLowerCase?.();
    const resolvedAbility = (rawAbility && ABILITY_NAME_TO_SLUG[rawAbility]) || ability;
    const preparation: "known" | "prepared" =
      sc.preparation === "known" || sc.preparation === "prepared"
        ? sc.preparation
        : (nameSlug === "wizard" ? "prepared" : "known");
    return { caster_type, ability: resolvedAbility, preparation, spell_list: sc.spell_list ?? base.name };
  }

  const preparation: "known" | "prepared" = nameSlug === "wizard" ? "prepared" : "known";
  return { caster_type, ability, preparation, spell_list: base.name };
}

function buildResources(structured: Record<string, unknown> | null): ResourceOut[] {
  if (!structured || !Array.isArray((structured as { resources?: unknown }).resources)) return [];
  const raw = (structured as { resources: Array<Record<string, unknown>> }).resources;
  const out: ResourceOut[] = [];
  for (const r of raw) {
    const id = (r.id as string) ?? (typeof r.name === "string" ? slugifyName(r.name) : null);
    const name = r.name as string | undefined;
    const max_formula = r.max_formula as string | undefined;
    const reset = r.reset as ResourceOut["reset"] | undefined;
    if (!id || !name || !max_formula || !reset) continue;
    out.push({ id, name, max_formula, reset });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Entry point.
// ---------------------------------------------------------------------------

export function toClassCanonical(entry: CanonicalEntry): ClassCanonical {
  const base = entry.base as unknown as Open5eClassBase;
  const structured = entry.structured as Record<string, unknown> | null;
  // pickOverlay now returns { class_features, classes }; unpack both sections.
  const ov = entry.overlay as {
    class_features: FeatureOverlayMap | null;
    classes: Record<string, ClassOverride> | null;
  } | null;
  const featureOverlay = ov?.class_features ?? null;
  const ownerBareSlug = bareSlug(entry.slug);
  const classOverride = ov?.classes?.[ownerBareSlug];

  const features = base.features ?? [];

  const hit_die = normalizeHitDie(base.hit_dice ?? base.hit_points?.hit_dice);
  const savingsParsed = parseSavingThrows(base.saving_throws);
  const saving_throws = clampSavingThrows(savingsParsed);
  const primary_abilities = resolvePrimaryAbilities(entry.slug, base.name, saving_throws);

  const { proficiencies, skill_choices } = parseProficienciesProse(features);
  const starting_equipment = parseStartingEquipment(features);

  // Resolve the subclass level/name (default → overlay `classes:` override)
  // before bucketing so the subclass-feature backfill can target the right
  // feature and level.
  const subclassLevel = classOverride?.subclass_level ?? 3;
  const subclassFeatureName = classOverride?.subclass_feature_name ?? "Subclass";

  const { features_by_level, idsByLevel } = bucketFeaturesByLevel(
    features, entry.edition, featureOverlay, ownerBareSlug,
    { level: subclassLevel, name: subclassFeatureName },
  );
  const table = buildTable(features, idsByLevel);

  const out: ClassCanonical = {
    slug: entry.slug,
    name: base.name,
    edition: entry.edition,
    source: entry.edition === "2014" ? "SRD 5.1" : "SRD 5.2",
    description: rewriteCrossRefs(base.desc ?? "", entry.edition),
    hit_die,
    primary_abilities,
    saving_throws,
    proficiencies,
    skill_choices,
    starting_equipment,
    spellcasting: buildSpellcasting(base, entry.slug, structured, classOverride?.spellcasting),
    subclass_level: subclassLevel,
    subclass_feature_name: subclassFeatureName,
    weapon_mastery: null,
    epic_boon_level: null,
    table,
    features_by_level,
    resources: buildResources(structured),
  };

  // Entity-level overrides from the overlay `classes:` section take precedence
  // over values derived from Open5e prose / defaults.
  if (classOverride?.skill_choices) out.skill_choices = classOverride.skill_choices;
  if (classOverride?.choices) out.choices = classOverride.choices;
  if (classOverride?.starting_equipment) out.starting_equipment = classOverride.starting_equipment;
  if (classOverride?.starting_gold) out.starting_gold = classOverride.starting_gold;

  return out;
}
