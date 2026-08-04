import type { Choice } from "../types/choice";

/**
 * Normalizes the authored two-step "Ability Score Increase or Feat" decision
 * into the flat feat pick the product now uses.
 *
 * This is a PERMANENT compatibility layer, not a migration shim: hand-authored
 * homebrew (e.g. `Compendium/MCDM/Classes/Illrigger.md`, which no bundle copy
 * can ever overwrite) keeps emitting the two-step shape, and `choiceSchema`
 * deliberately keeps accepting it.
 *
 * The lifted choice is the AUTHORED inner one, returned verbatim, so a homebrew
 * variant carrying its own `where` / `count` / `label` survives. When the feat
 * branch carries more than one child choice the whole choice is returned
 * untouched, because lifting would silently drop the sibling.
 *
 * Pure: never mutates its input, never synthesizes a new object.
 */
export function flattenAsiOrFeat(choice: Choice): Choice {
  if (choice.kind !== "select-inline" || choice.id !== "asi-or-feat") return choice;

  const featBranches = choice.options.filter((o) =>
    (o.choices ?? []).some((c) => c.kind === "select-entity" && c.entity_type === "feat"));
  if (featBranches.length !== 1) return choice;

  const inner = featBranches[0].choices ?? [];
  if (inner.length !== 1) return choice;

  const only = inner[0];
  if (only.kind !== "select-entity" || only.entity_type !== "feat") return choice;
  return only;
}
