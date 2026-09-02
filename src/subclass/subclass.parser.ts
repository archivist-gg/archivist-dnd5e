import type { SubclassEntity } from "./subclass.types";
import { ParseResult, parseYaml } from "@archivist-gg/core";
import { subclassEntitySchema } from "./subclass.schema";
import { aliasFeaturesByLevelActionCost } from "../schemas/feature-alias";

export function parseSubclass(source: string): ParseResult<SubclassEntity> {
  const raw = parseYaml<Record<string, unknown>>(source, ["name", "slug", "parent_class"]);
  if (!raw.success) return raw;

  // R4-G3a §10.2.1: the same `action_cost` alias, for symmetry at zero cost (no carriers here
  // today) so a class-side action cost can never route to `passive` the way the race one did.
  aliasFeaturesByLevelActionCost(raw.data.features_by_level);

  const result = subclassEntitySchema.safeParse({ edition: "2014", ...raw.data });
  if (!result.success) {
    return { success: false, error: `subclass schema validation failed: ${result.error.message}` };
  }
  return { success: true, data: result.data as SubclassEntity };
}
