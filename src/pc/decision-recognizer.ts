import type { Feature } from "@archivist-gg/dnd5e/types/feature";
import type { Choice } from "@archivist-gg/dnd5e/types/choice";

// Prose that signals a player decision. Tuned: bare "select"/"pick" produce
// too many false positives; these three forms are the reliable signals.
export const DECISION_SIGNAL = [/\bchoose (one|two|three|a|an)\b/i, /\bof your choice\b/i, /\byour choice of\b/i];

// Ability Score Improvement synthesizes a FLAT feat pick: the same shape
// `flattenAsiOrFeat` (src/pc/pc.asi-flatten.ts) normalizes the older two-step
// select-inline down to. Emitting it flat here means the normalizer is a no-op
// on this value; it stays in place because hand-authored homebrew still emits
// the two-step shape and `choiceSchema` still accepts it.
// `id: "feat"` is load-bearing, not cosmetic: `collectFeatSlugs`
// (pc.resolver.ts) and `collectClassFeatAbilityPoints` (pc.recalc.ts) read the
// literal `feat` key out of the persisted choice block, and buildItem
// namespaces this choice's grandchildren with the hardcoded prefix `feat:`
// rather than with the choice's own id. Any other id breaks both, silently.
const ASI_FEAT: Choice = { kind: "select-entity", id: "feat", entity_type: "feat", count: 1 };

/** id/name-slug → synthesized decision. Keep small and justified: this only
 *  serves un-annotated homebrew (the coverage gate keeps SRD authored).
 *  These shapes intentionally mirror the canonical authored overlay entries in
 *  `tools/srd-canonical/overlays/*.yaml`; keep them in sync. */
const TABLE: Record<string, Choice[]> = {
  "ability-score-improvement": [ASI_FEAT],
  "expertise": [{ kind: "select-proficiency", id: "expertise", count: 2, domain: "skill", from_proficient: true, expertise: true }],
  "fighting-style": [{ kind: "select-entity", id: "fighting-style", count: 1, entity_type: "optional-feature", where: { feature_type: "fighting_style", available_to: "self" } }],
};

export function recognizeDecision(feature: Feature): Choice[] | "informational" | null {
  const slug = (feature.id ?? feature.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  if (TABLE[slug]) return TABLE[slug];
  const desc = feature.description ?? "";
  return DECISION_SIGNAL.some(re => re.test(desc)) ? "informational" : null;
}
