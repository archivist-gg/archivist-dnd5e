import type { EntityType } from "@archivist-gg/core";
import { spellCodec } from "./spell.codec";
import { spellGeneratable } from "./spell.generatable";

export const spellEntityType: EntityType = {
  type: "spell",
  doc: spellCodec,
  generatable: spellGeneratable,
};
