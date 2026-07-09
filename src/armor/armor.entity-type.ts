import type { EntityType } from "@archivist-gg/core";
import { armorCodec } from "./armor.codec";

export const armorEntityType: EntityType = {
  type: "armor",
  doc: armorCodec,
};
