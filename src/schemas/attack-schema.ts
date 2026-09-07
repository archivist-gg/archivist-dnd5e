import { z } from "zod";

const abilityEnum = z.enum(["str", "dex", "con", "int", "wis", "cha"]);

export const attackSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["melee", "ranged", "spell"]),
  ability: z.union([abilityEnum, z.array(abilityEnum).nonempty()]).optional(),
  damage: z.string().optional(),
  damage_type: z.string().optional(),
  action: z.enum(["action", "bonus-action", "reaction"]).optional(),
  properties: z.array(z.string()).optional(),
  range: z.object({
    normal: z.number().int().nonnegative().optional(),
    long: z.number().int().nonnegative().optional(),
    reach: z.number().int().nonnegative().optional(),
  }).optional(),
  condition: z.string().optional(),
  // R4-G6 §5: declared on the `Attack` interface since the monster port, stripped by this schema until now.
  // Monsters are the only carriers (8,176 bonuses, 1,796 extra-damage riders in the converter corpus).
  bonus: z.number().optional(),
  extra_damage: z.object({ dice: z.string(), type: z.string() }).optional(),
});
