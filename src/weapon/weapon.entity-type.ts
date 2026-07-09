import type { EntityType } from "@archivist-gg/core";
import { weaponCodec } from "./weapon.codec";

export const weaponEntityType: EntityType = {
  type: "weapon",
  doc: weaponCodec,
};
