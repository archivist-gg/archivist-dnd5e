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
