import type { EntityType } from "@archivist-gg/core";
import { backgroundCodec } from "./background.codec";

export const backgroundEntityType: EntityType = {
  type: "background",
  doc: backgroundCodec,
};
