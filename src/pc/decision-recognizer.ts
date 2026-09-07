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
// `id: "feat"` is load-bearing, not cosmetic. THREE readers CONSUME the literal
// `feat` key out of the persisted choice block · `collectFeatSlugs`
// (pc.resolver.ts), `PCResolver.resolve`'s feat-to-spell pass (pc.resolver.ts,
// the one that makes a SPELL-granting feat work) and
// `collectClassFeatAbilityPoints` (pc.recalc.ts). A fourth site,
// `collectClassAsiBranch` (pc.recalc.ts), reads the same key since R4-P4 but only
// to DETECT the feat branch by `typeof`, never to consume the value. All four are
// cited by SYMBOL, not line: line citations into these two files have already
// failed twice on this branch, in TWO DIFFERENT WAYS. A `pc.decision-engine.ts:428`
// in the plugin's decision-strip test was true when written and was then falsified
// by a LATER dnd5e commit on the same branch that added lines above the target.
// A `pc.recalc.ts:376` in the overlays never went stale at all: it was WRONG ON
// ARRIVAL, because the very commit that wrote the cite also added the docblock
// lines that pushed `block.feat` down to :381, leaving :376 a blank line.
// Separately, buildItem namespaces this choice's grandchildren
// with the hardcoded prefix `feat:` rather than with the choice's own id · that
// is why pc.decision-engine.ts is NOT among the readers above, and why the R4-P4
// epic-boon re-key moved no grandchild key. Any other id breaks all three
// consumers, silently.
const ASI_FEAT: Choice = { kind: "select-entity", id: "feat", entity_type: "feat", count: 1 };

/** id/name-slug → synthesized decision. Keep small and justified: this only
 *  serves un-annotated homebrew (the coverage gate keeps SRD authored).
 *  These shapes intentionally mirror the canonical authored overlay entries in
 *  `tools/srd-canonical/overlays/*.yaml`; keep them in sync.
 *
 *  SUPPRESSED at the LEDGER, never here (R4-G5 §3.2.4 / §3.2.5): `buildDecisionLedger` drops a synthetic whose
 *  `where.feature_type` is already served on the same class, either by a DECLARED selection pool whose resolved
 *  twin emits a row at the character's level (the 2014 Fighter carried BOTH a `fighting-style` pool and this
 *  synthetic on one key, so it drew two controls) or by a raw `feat_progression` row whose mapped category pairs
 *  with that feature_type (the PHB 2024 Fighter / Paladin / Ranger, where this synthetic offered thirteen
 *  wrong-edition optional features on a key nothing read). This TABLE is returned BY REFERENCE and is never
 *  mutated: the ledger REBINDS its own local array instead, which is also what leaves the suppressed level its
 *  informational card. */
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
