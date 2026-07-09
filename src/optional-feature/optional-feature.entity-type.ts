import type { EntityType } from "@archivist-gg/core";
import { optionalFeatureCodec } from "./optional-feature.codec";

export const optionalFeatureEntityType: EntityType = {
  type: "optional-feature",
  doc: optionalFeatureCodec,
};
