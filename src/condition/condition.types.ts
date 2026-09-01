import type { imageField } from "../schemas/entity-extras-schema";
import type { Edition } from "../types/edition";
import type { z } from "zod";

/** A 5e condition document (spec §6). Mirrors `conditionEntitySchema` exactly. */
export interface ConditionEntity {
  slug: string;
  name: string;
  edition: Edition;
  source: string;
  /** Markdown; wikilinks to sibling conditions ride through verbatim. */
  description: string;
  has_fluff_images?: boolean;
  /** One wikilink, or an array for >= 2 fluff images (images-ON emit). */
  image?: z.infer<typeof imageField>;
}
