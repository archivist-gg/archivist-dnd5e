import type { ArmorEntity } from "./armor.types";
import { ParseResult, parseYaml } from "@archivist-gg/core";
import { armorEntitySchema } from "./armor.schema";

const KNOWN_KEYS = new Set([
  "name", "slug", "category", "ac",
  "strength_requirement", "stealth_disadvantage",
  "weight", "cost", "rarity",
  "source", "page", "edition",
  "entries", "raw",
  // Root extras declared on armorEntitySchema (spec §5). The schema declaring them is NOT
  // enough: this set is the second, independent gate — a key missing here is copied into
  // `raw` as well, so the two lists must move together.
  "rendering_hint", "has_fluff", "has_fluff_images", "image",
  // The alias is a KNOWN key so it is never copied into `raw` alongside the mapped
  // `strength_requirement` — that duplicate is the census row this fix empties.
  "strength_required",
]);

export function parseArmor(source: string): ParseResult<ArmorEntity> {
  const raw = parseYaml<Record<string, unknown>>(source, ["name", "slug", "category", "ac"]);
  if (!raw.success) return raw;

  // The SRD armor bundle spells the Strength minimum `strength_required`, while the schema,
  // the type and the plugin's renderer all read `strength_requirement`. Map the alias BEFORE
  // validation so the Strength line renders on the 6 SRD armor notes that carry it.
  //
  // A DECLARED `strength_requirement` always wins: the alias only fills a hole.
  //
  // The alias is deliberately NOT deleted from `raw.data`. `armorEntitySchema` is `.loose()`,
  // so it rides onto the typed output as an inert extra and its census disposal stays `kept`
  // (untallied). Deleting it would strip it from the output and mint a NEW `stripped` census
  // row of 6 — spec §5 forbids that. `KNOWN_KEYS` (above) is what stops the raw-bag copy.
  if (raw.data.strength_requirement === undefined && typeof raw.data.strength_required === "number") {
    raw.data.strength_requirement = raw.data.strength_required;
  }

  const result = armorEntitySchema.safeParse(raw.data);
  if (!result.success) {
    return { success: false, error: `armor schema validation failed: ${result.error.message}` };
  }

  const entity = result.data as ArmorEntity;
  const extras: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw.data)) {
    if (!KNOWN_KEYS.has(k)) extras[k] = v;
  }
  if (Object.keys(extras).length > 0) {
    entity.raw = { ...(entity.raw ?? {}), ...extras };
  }

  return { success: true, data: entity };
}
