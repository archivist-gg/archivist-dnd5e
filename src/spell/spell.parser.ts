import { Spell, CastingOption } from "./spell.types";
import { ParseResult, parseYaml, toStringSafe } from "@archivist-gg/core";
import { spellEntitySchema } from "./spell.schema";

const KNOWN_KEYS = new Set([
  "name", "level", "school", "casting_time", "range", "components", "duration",
  "concentration", "ritual", "classes", "description", "at_higher_levels",
  "damage", "damage_roll", "saving_throw", "casting_options",
  // §2 · the fourteen converter keys. This gate and `spellEntitySchema` are independent: a key
  // missing here is refused BEFORE zod ever sees it, so both must learn every new key.
  "rendering_hint", "misc_tags", "area_tags", "condition_inflict", "affects_creature_type",
  "spell_attack", "ability_check", "damage_resist", "damage_immune", "condition_immune",
  "damage_vulnerable", "has_fluff", "image", "has_fluff_images",
  // Body-only metadata that's emitted to YAML but ignored at runtime — accept silently.
  "slug", "edition", "source",
]);

/** `ends` word map (§3.3): the corpus's own lowercase past-tense forms. */
const DURATION_END_WORDS: Record<string, string> = { dispel: "dispelled", trigger: "triggered" };

/**
 * §3.3 · collapse the converter's structured `components` object to the corpus's own string form
 * (`V, S, M (a coin), R`), leaving a string input byte-unchanged. Letter order is V, S, M, R;
 * `m` object -> `M (<text>)` (the text already carries the cost prose), `m` string -> `M (<value>)`,
 * `m: true` -> a bare `M`. A boolean flag contributes its letter only when it is exactly `true`.
 * Casing follows the 862 string-form carriers (uppercase letters); `R` has no precedent among them
 * and is an invented-but-decided literal (Gate 0 B-5).
 *
 * The parameter is `unknown` on purpose: `spellComponentsObjectSchema` stays local and unexported,
 * so this function narrows structurally instead of importing the schema's type. `toStringSafe` is
 * the unreachable-shape fallback (the schema has already accepted the value by the time we run).
 */
export function normalizeSpellComponents(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null || typeof value !== "object" || Array.isArray(value)) return toStringSafe(value);
  const c = value as { v?: unknown; s?: unknown; m?: unknown; r?: unknown };
  const parts: string[] = [];
  if (c.v === true) parts.push("V");
  if (c.s === true) parts.push("S");
  if (typeof c.m === "string") parts.push(`M (${c.m})`);
  else if (c.m === true) parts.push("M");
  else if (c.m != null && typeof c.m === "object") {
    const text = (c.m as { text?: unknown }).text;
    parts.push(typeof text === "string" ? `M (${text})` : "M");
  }
  if (c.r === true) parts.push("R");
  return parts.join(", ");
}

/** §3.3 · one entry of the structured `duration` array. Structural narrowing, same reason as above. */
function normalizeSpellDurationEntry(entry: unknown): string {
  if (entry == null || typeof entry !== "object") return toStringSafe(entry);
  const e = entry as {
    type?: unknown;
    ends?: unknown;
    duration?: { type?: unknown; amount?: unknown; up_to?: unknown };
  };
  if (e.type === "permanent" && Array.isArray(e.ends)) {
    return "until " + e.ends.map(w => DURATION_END_WORDS[String(w)] ?? String(w)).join(" or ");
  }
  if (e.type === "timed" && e.duration != null) {
    const unit = e.duration.type;
    const amount = e.duration.amount;
    if (typeof unit === "string" && typeof amount === "number") {
      const prefix = e.duration.up_to === true ? "up to " : "";
      return `${prefix}${amount} ${unit}${amount > 1 ? "s" : ""}`;
    }
  }
  return toStringSafe(entry);
}

/**
 * §3.3 · collapse the converter's structured `duration` array to the corpus's own lowercase string
 * form (`until dispelled`, `up to 1 hour`), leaving a string input byte-unchanged. Concentration is
 * NEVER synthesised here — the separate `concentration` boolean drives the sheet's `Conc · ` prefix.
 * Zero docs carry more than one entry; the `; ` join is the defensive path for the day one does.
 */
export function normalizeSpellDuration(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return toStringSafe(value);
  return value.map(entry => normalizeSpellDurationEntry(entry)).join("; ");
}

/**
 * R4-G7 §7.5 · the RESOLVE-time twin of the two normalisations `parseSpell` performs below. The PC pipeline
 * reads RAW registry entities (`reg.data as unknown as Spell`), so a converter spell reaches the sheet with a
 * structured `components` object and `duration` array unless it passes through here; `componentLetters`
 * (the sheet) and the add drawer's duration cell both read strings. The `!= null` guards MIRROR `parseSpell`'s
 * own, so a spell that authors neither key keeps neither. Lives HERE, beside the normalisers, and not in
 * `pc.resolver.ts`, which already imports `pc.additional-spells` and would make the two a value cycle
 * [G2-I-2]. Returns a fresh object; the shared registry entity is never mutated.
 */
export function mirrorSpellShapes(entity: Spell): Spell {
  return {
    ...entity,
    ...(entity.components != null ? { components: normalizeSpellComponents(entity.components) } : {}),
    ...(entity.duration != null ? { duration: normalizeSpellDuration(entity.duration) } : {}),
  };
}

export function parseSpell(source: string): ParseResult<Spell> {
  const result = parseYaml<Record<string, unknown>>(source, ["name"]);
  if (!result.success) return result;

  // Strip body-only metadata before schema validation. `source` and `edition`
  // are preserved on the output for renderers (e.g. source-badge); `slug` is
  // discarded — it's a build-time identifier the runtime doesn't need.
  const meta: { source?: string; edition?: string } = {};
  if (typeof result.data.source === "string") meta.source = result.data.source;
  if (typeof result.data.edition === "string") meta.edition = result.data.edition;
  const filtered: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(result.data)) {
    if (k === "slug" || k === "edition" || k === "source") continue;
    if (!KNOWN_KEYS.has(k)) {
      return { success: false, error: `Unknown spell field: ${k}` };
    }
    filtered[k] = v;
  }

  const parsed = spellEntitySchema.safeParse(filtered);
  if (!parsed.success) {
    return { success: false, error: `spell schema validation failed: ${parsed.error.message}` };
  }

  // Coerce remaining shape (mostly identity now that schema validates).
  const raw = parsed.data;
  const spell: Spell = { name: raw.name };
  if (raw.level != null) spell.level = raw.level;
  if (raw.school != null) spell.school = toStringSafe(raw.school);
  if (raw.casting_time != null) spell.casting_time = toStringSafe(raw.casting_time);
  if (raw.range != null) spell.range = toStringSafe(raw.range);
  if (raw.components != null) spell.components = normalizeSpellComponents(raw.components);
  if (raw.duration != null) spell.duration = normalizeSpellDuration(raw.duration);
  if (raw.concentration != null) spell.concentration = Boolean(raw.concentration);
  if (raw.ritual != null) spell.ritual = Boolean(raw.ritual);
  if (raw.classes) spell.classes = raw.classes.map(String);
  if (raw.description) spell.description = raw.description;
  if (raw.at_higher_levels) spell.at_higher_levels = raw.at_higher_levels.map(String);
  if (raw.damage) spell.damage = { types: raw.damage.types.map(String) };
  // `!= null`, never truthiness: an authored empty roll is kept as authored (the scaling readers skip it).
  if (raw.damage_roll != null) spell.damage_roll = raw.damage_roll;
  if (raw.saving_throw) spell.saving_throw = { ability: raw.saving_throw.ability };
  if (raw.casting_options) {
    spell.casting_options = raw.casting_options.map(opt => {
      const co: CastingOption = { type: opt.type };
      if (opt.damage_roll !== undefined) co.damage_roll = opt.damage_roll;
      if (opt.target_count !== undefined) co.target_count = opt.target_count;
      if (opt.duration !== undefined) co.duration = opt.duration;
      if (opt.range !== undefined) co.range = opt.range;
      if (opt.concentration !== undefined) co.concentration = opt.concentration;
      if (opt.shape_size !== undefined) co.shape_size = opt.shape_size;
      if (opt.desc !== undefined) co.desc = opt.desc;
      return co;
    });
  }
  // §2 · the fourteen new keys. The guard is `!= null` on EVERY one, never truthiness: all 1,048
  // `rendering_hint` carriers hold `''`, so the truthiness idiom this file still uses for
  // `description` above would strip every one of them (that idiom is what minted the SRD
  // `spell::description::stripped` census row on the one falsy-description document).
  if (raw.rendering_hint != null) spell.rendering_hint = raw.rendering_hint;
  if (raw.misc_tags != null) spell.misc_tags = raw.misc_tags;
  if (raw.area_tags != null) spell.area_tags = raw.area_tags;
  if (raw.condition_inflict != null) spell.condition_inflict = raw.condition_inflict;
  if (raw.affects_creature_type != null) spell.affects_creature_type = raw.affects_creature_type;
  if (raw.spell_attack != null) spell.spell_attack = raw.spell_attack;
  if (raw.ability_check != null) spell.ability_check = raw.ability_check;
  if (raw.damage_resist != null) spell.damage_resist = raw.damage_resist;
  if (raw.damage_immune != null) spell.damage_immune = raw.damage_immune;
  if (raw.condition_immune != null) spell.condition_immune = raw.condition_immune;
  if (raw.damage_vulnerable != null) spell.damage_vulnerable = raw.damage_vulnerable;
  if (raw.has_fluff != null) spell.has_fluff = raw.has_fluff;
  if (raw.image != null) spell.image = raw.image;
  if (raw.has_fluff_images != null) spell.has_fluff_images = raw.has_fluff_images;
  if (meta.source) spell.source = meta.source;
  if (meta.edition) spell.edition = meta.edition;
  return { success: true, data: spell };
}
