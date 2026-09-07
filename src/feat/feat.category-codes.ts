import type { FeatCategory } from "../types/choice";

/** 5etools feat `category` codes, as DATA beside the schema (never a renderer switch). The converter emits the raw
 *  code on `exclusive-feat-category` and `feat-category` prerequisites (today only "D", on 14 documents; the G7
 *  handoff asks it for a name). `FS:P` and `FS:R` are the Paladin- and Ranger-scoped fighting-style categories.
 *  Measured in data/feats.json: G 80, EB 29, O 25, D 13, FS 10, DG 9, FS:P 1, FS:R 1. Unknown codes fall back to
 *  the code itself. */
export const FEAT_CATEGORY_CODE_LABELS: Readonly<Record<string, string>> = {
  D: "Dragonmark", G: "General", O: "Origin", FS: "Fighting Style", EB: "Epic Boon", DG: "Dark Gift",
  "FS:P": "Fighting Style", "FS:R": "Fighting Style",
};
export function featCategoryLabel(code: string): string {
  return FEAT_CATEGORY_CODE_LABELS[code] ?? code;
}

/** 5etools `feat_progression.category` codes to the ENGINE's `FeatCategory` vocabulary (R4-G5 §3.2.5,
 *  invariant 3): the DATA table the class-side progression reader maps through, beside the label table above.
 *  MEASURED over the converted corpus 2026-09-07: 18 `feat_progression` rows across 15 documents, codes
 *  {EB 13, FS 4, FS:P 1, FS:R 1, O 1}. The FS four are Fighter 2024 (level 1), Paladin 2024 and Ranger 2024
 *  (level 2, each carrying `["FS","FS:P"]` / `["FS","FS:R"]`) and the Champion 2024 SUBCLASS (level 7); the 13
 *  EB rows are the 12 PHB 2024 classes plus the Eberron Artificer, all at level 19. The single `O` row sits on
 *  an OPTIONAL FEATURE (Lessons of the First Ones) with a `"*"` progression key, outside the class walk, so `O`
 *  and `G` have zero live class-side carriers and are declared for completeness. `D` (Dragonmark) and `DG`
 *  (Dark Gift) map to NOTHING on purpose: they are not player-choosable feat categories in this vocabulary, and
 *  a row carrying only those emits no decision and warns once at the reader. G7 handoff (spec §11): the
 *  converter re-emits these codes in engine vocabulary and this table retires. */
export const FEAT_PROGRESSION_CATEGORY: Readonly<Record<string, FeatCategory>> = {
  FS: "fighting-style", "FS:P": "fighting-style", "FS:R": "fighting-style",
  EB: "epic-boon", O: "origin", G: "general",
};

/** The ONE `FeatCategory` to optional-feature `feature_type` pairing (R4-G5 §3.2.5). The shape-B suppression
 *  reads it to decide that a class carrying a fighting-style `feat_progression` row must NOT also be offered the
 *  recognizer's `fighting_style` optional-feature synthetic at that level. `Partial<Record<...>>` because three
 *  of the four categories pair with nothing, which is also what makes the lookup return `string | undefined`
 *  without an own-property guard. */
export const FEATURE_TYPE_FOR_CATEGORY: Readonly<Partial<Record<FeatCategory, string>>> = {
  "fighting-style": "fighting_style",
};

/** Reduce a `feat_progression` entry's `category` ARRAY to ONE engine category: the FIRST code that maps wins, so
 *  the shipped `["FS","FS:P"]` (Paladin) and `["FS","FS:R"]` (Ranger) each yield exactly ONE decision instead of
 *  two. OWN-property guarded (invariant 3): the codes come from converter data, so `constructor` would otherwise
 *  index a FUNCTION through the prototype chain. Returns undefined when nothing maps (an all-`D` row); the
 *  CALLER warns, because this stays pure. */
export function featProgressionCategory(codes: readonly string[] | undefined): FeatCategory | undefined {
  for (const code of codes ?? []) {
    if (Object.prototype.hasOwnProperty.call(FEAT_PROGRESSION_CATEGORY, code)) {
      return FEAT_PROGRESSION_CATEGORY[code];
    }
  }
  return undefined;
}
