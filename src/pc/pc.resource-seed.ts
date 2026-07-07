import type { ResolvedCharacter, DerivedStats, FeatureSource } from "./pc.types";
import type { FormulaBindings } from "@archivist/dnd5e/dnd/resource-formula";
import { numericColumnsAt } from "./pc.table-column";

/** Build the DSL bindings for a resource granted via `source`. `class_level`
 *  is the character's level in the granting class; for a `subclass` source it
 *  is the level in the class that OWNS that subclass, and it falls back to the
 *  total level for race/background/feat sources (or when the class isn't found).
 *  Also binds `columns` — the numeric values of that (sub)class's table row at
 *  `class_level` (empty when there is no table/row), backing the `column('Name')`
 *  accessor in the DSL. Ability mods come from the final (post-bonus) derived mods. */
export function resourceBindings(
  resolved: ResolvedCharacter,
  derived: DerivedStats,
  source: FeatureSource,
): FormulaBindings {
  let classLevel = resolved.totalLevel;
  let table: Record<number, { columns?: Record<string, string | number> }> | undefined;
  if (source.kind === "class") {
    const c = resolved.classes.find((c) => c.entity?.slug === source.slug);
    classLevel = c?.level ?? resolved.totalLevel;
    table = c?.entity?.table;
  } else if (source.kind === "subclass") {
    const c = resolved.classes.find((c) => c.subclass?.slug === source.slug);
    classLevel = c?.level ?? resolved.totalLevel;
    table = c?.subclass?.table;
  }
  return {
    level: resolved.totalLevel,
    class_level: classLevel,
    prof: derived.proficiencyBonus,
    str_mod: derived.mods.str, dex_mod: derived.mods.dex, con_mod: derived.mods.con,
    int_mod: derived.mods.int, wis_mod: derived.mods.wis, cha_mod: derived.mods.cha,
    columns: numericColumnsAt(table, classLevel),
  };
}
