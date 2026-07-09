import type { EntityType } from "@archivist-gg/core";
import { classCodec } from "./class.codec";

export const classEntityType: EntityType = {
  type: "class",
  doc: classCodec,
};
