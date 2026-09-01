import type { ConditionEntity } from "./condition.types";
import { ParseResult, parseYaml } from "@archivist-gg/core";
import { conditionEntitySchema } from "./condition.schema";

/**
 * The RACE pattern (spec §6): required keys enforced by `parseYaml`, the
 * `edition: "2014"` default seeded BEFORE validation (a declared edition wins —
 * the spread order is load-bearing), and `result.data` returned DIRECTLY. That
 * keeps `slug` on the output — the spell parser's slug strip is what mints its
 * 1,048-row census row — and, because the measured corpus carries exactly the two
 * declared key-sets, `z.object`'s strip removes nothing. The absence of a
 * KNOWN_KEYS gate and a `raw` bag is why there is no *relocated* or *duplicated*
 * row either.
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
