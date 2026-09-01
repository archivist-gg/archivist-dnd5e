import type { DocCodec, EntityDoc, ParseResult } from "@archivist-gg/core";
import yaml from "js-yaml";
import type { ConditionEntity } from "./condition.types";
import { parseCondition } from "./condition.parser";

/**
 * Normalizing codec. `parse` delegates to `parseCondition`, which seeds the
 * `edition: "2014"` default and validates against `conditionEntitySchema`.
 * `serialize` stays `yaml.dump` (the edit-save path uses obsidian's separate
 * serializer), mirroring every sibling entity codec.
 */
export const conditionCodec: DocCodec<ConditionEntity> = {
  parse(doc: EntityDoc): ParseResult<ConditionEntity> {
    return parseCondition(doc.body);
  },
  serialize(entity: ConditionEntity): string {
    return yaml.dump(entity, { lineWidth: -1, sortKeys: false });
  },
};
