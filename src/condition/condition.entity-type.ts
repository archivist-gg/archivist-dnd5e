import type { EntityType } from "@archivist-gg/core";
import { conditionCodec } from "./condition.codec";

export const conditionEntityType: EntityType = {
  type: "condition",
  doc: conditionCodec,
};
