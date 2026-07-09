import type { Abilities } from "./abilities";
import type { EntityRegistry } from "@archivist-gg/core";

export interface FormulaContext {
  abilities: Abilities;
  proficiencyBonus: number;
  compendium?: EntityRegistry;
}
