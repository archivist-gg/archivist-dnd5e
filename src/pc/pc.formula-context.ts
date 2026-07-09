import type { EntityRegistry } from "@archivist-gg/core";
import type { FormulaContext } from "@archivist-gg/dnd5e/types/formula-context";
import type { DerivedStats, ResolvedCharacter } from "./pc.types";

export function buildFormulaContext(
  resolved: ResolvedCharacter,
  derived: DerivedStats,
  registry: EntityRegistry,
): FormulaContext {
  return {
    abilities: resolved.definition.abilities,
    proficiencyBonus: derived.proficiencyBonus,
    compendium: registry,
  };
}
