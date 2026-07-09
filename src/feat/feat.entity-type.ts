import type { EntityType } from "@archivist-gg/core";
import { featCodec } from "./feat.codec";

export const featEntityType: EntityType = {
  type: "feat",
  doc: featCodec,
};
