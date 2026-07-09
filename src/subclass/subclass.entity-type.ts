import type { EntityType } from "@archivist-gg/core";
import { subclassCodec } from "./subclass.codec";

export const subclassEntityType: EntityType = {
  type: "subclass",
  doc: subclassCodec,
};
