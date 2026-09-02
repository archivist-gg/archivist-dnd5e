import type { RaceEntity } from "./race.types";
import { ParseResult, parseYaml } from "@archivist-gg/core";
import { raceEntitySchema } from "./race.schema";
import { aliasFeatureListActionCost } from "../schemas/feature-alias";

export function parseRace(source: string): ParseResult<RaceEntity> {
  const raw = parseYaml<Record<string, unknown>>(source, ["name", "slug"]);
  if (!raw.success) return raw;

  // R4-G3a §10.2.1: the bundle spells a trait's action cost `action_cost`; alias it onto the
  // canonical `action` the badge router reads, BEFORE validation. The only carrier root.
  aliasFeatureListActionCost(raw.data.traits);

  const result = raceEntitySchema.safeParse({ edition: "2014", ...raw.data });
  if (!result.success) {
    return { success: false, error: `race schema validation failed: ${result.error.message}` };
  }
  return { success: true, data: result.data as RaceEntity };
}
