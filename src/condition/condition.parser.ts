import type { ConditionEntity } from "./condition.types";
import { ParseResult, parseYaml } from "@archivist-gg/core";
import { conditionEntitySchema } from "./condition.schema";

/**
 * The RACE pattern (spec §6): required keys enforced by `parseYaml`, the
 * `edition: "2014"` default seeded BEFORE validation (a declared edition wins —
 * the spread order is load-bearing), and `result.data` returned DIRECTLY. That
 * last part keeps `slug` on the output and adds no `stripped` census row: there
 * is no KNOWN_KEYS gate and no `raw` bag on this entity.
 */
export function parseCondition(source: string): ParseResult<ConditionEntity> {
  const raw = parseYaml<Record<string, unknown>>(source, ["name", "slug"]);
  if (!raw.success) return raw;

  const result = conditionEntitySchema.safeParse({ edition: "2014", ...raw.data });
  if (!result.success) {
    return { success: false, error: `condition schema validation failed: ${result.error.message}` };
  }
  return { success: true, data: result.data as ConditionEntity };
}
