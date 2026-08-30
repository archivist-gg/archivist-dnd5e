import { z } from "zod";
/** THE caster-type vocabulary, declared once (R4-G1a D6a). "artificer" is a fifth progression (level-1 slots,
 *  then the half-caster table; multiclass contributes half its levels rounded UP; prepared count is Int mod +
 *  floor(level/2) when no table column supplies it). The XPHB Paladin and Ranger carry it in the converter's
 *  emission. Imported by the class and subclass schemas, the class types, pc.types and the generator's overlay
 *  schema and class merger: never redeclare it. */
export const casterTypeEnum = z.enum(["full", "half", "third", "pact", "artificer"]);
export type CasterType = z.infer<typeof casterTypeEnum>;
