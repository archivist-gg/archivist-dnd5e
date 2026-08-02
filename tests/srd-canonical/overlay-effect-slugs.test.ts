import { describe, it, expect } from "vitest";
import * as path from "node:path";
import { loadOverlay } from "../../tools/srd-canonical/sources/overlay";
import { overlaySchema } from "../../tools/srd-canonical/overlay.schema";
import { ALL_SKILL_SLUGS, ALL_TOOLS, ALL_LANGUAGES } from "../../src/types/choice";
import { toProfSlug } from "../../src/pc/pc.proficiency-normalize";

/**
 * R4-P3c task 10 · the authored-`effects[]` proficiency-slug guard.
 *
 * `featureEffectSchema`'s proficiency arm is
 * `{ kind: "proficiency", proficiency_type: <enum>, value: z.string().min(1) }`
 * · `value` is an OPEN string with no vocabulary check, so a bogus slug
 * authored into an overlay effect parses clean, ships, and resolves to nothing
 * at runtime. Nothing else in the suite looks at it.
 *
 * Two structural rules, inherited from `overlay-tool-pools.test.ts` and from
 * what went wrong in P3a:
 *   1. `loadOverlay` is ASYNC and takes a RESOLVED path. Called synchronously
 *      on a bare filename it yields a Promise, every section reads `undefined`,
 *      `bad` is always `[]`, and this whole file passes vacuously with every
 *      mutation control green. Always `await` it on an absolute path.
 *   2. The walk is RECURSIVE. `featureEffectSchema` is reachable through
 *      `choices[].options[].effects` as well as a top-level `effects[]`
 *      (`src/schemas/choice-schema.ts` gives `inlineOptionSchema` both an
 *      `effects` array and recursive `choices`), and that nesting is live
 *      shipped data: `draconic-ancestry` authors ten such blocks in each
 *      overlay. P3a's tool-pool guard shipped BLIND for exactly this reason ·
 *      it walked `choices` and descended into no option. Descend it.
 *
 * Every assertion here was mutation-tested: a bogus `value:` was injected at a
 * top-level `race_traits` effect, at a nested `draconic-ancestry` option
 * effect, at `optional_features` in the 2014 overlay and at `feats` in the 2024
 * overlay, and each injection was OBSERVED RED before this file was trusted.
 */

export const OVERLAY_2014 = path.resolve(__dirname, "../../tools/srd-canonical/overlays/srd-5e.yaml");
export const OVERLAY_2024 = path.resolve(__dirname, "../../tools/srd-canonical/overlays/srd-2024.yaml");

/** Every overlay section that can carry an `effects` array, top level or nested. */
const SECTIONS_WITH_EFFECTS = [
  "race_traits", "class_features", "feat_features", "background_features",
  "feats", "optional_features", "races", "classes", "backgrounds",
] as const;

/** The three `proficiency_type`s with a CLOSED vocabulary. The schema's enum
 *  also admits saving-throw / armor / weapon, which have no closed slug list
 *  here, so they are deliberately unchecked rather than silently rejected. */
const VOCAB: Record<string, readonly string[]> = {
  skill: ALL_SKILL_SLUGS, tool: ALL_TOOLS, language: ALL_LANGUAGES,
};

/** Walk `effects[]` AND `choices[].options[].effects` recursively. */
function collectEffects(node: unknown, out: unknown[]): void {
  if (!node || typeof node !== "object") return;
  const rec = node as Record<string, unknown>;
  for (const eff of (rec.effects as unknown[]) ?? []) out.push(eff);
  for (const choice of (rec.choices as unknown[]) ?? []) {
    const c = choice as Record<string, unknown>;
    for (const opt of (c.options as unknown[]) ?? []) collectEffects(opt, out);
  }
}

/** Every effect object the walk reaches, tagged `section.key`. */
function allEffects(overlay: unknown): Array<{ where: string; eff: unknown }> {
  const out: Array<{ where: string; eff: unknown }> = [];
  for (const section of SECTIONS_WITH_EFFECTS) {
    const entries = (overlay as Record<string, Record<string, unknown>>)[section] ?? {};
    for (const [key, rec] of Object.entries(entries)) {
      const effects: unknown[] = [];
      collectEffects(rec, effects);
      for (const eff of effects) out.push({ where: `${section}.${key}`, eff });
    }
  }
  return out;
}

function badSlugs(overlay: unknown): string[] {
  const bad: string[] = [];
  for (const { where, eff } of allEffects(overlay)) {
    const e = eff as { kind?: string; proficiency_type?: string; value?: string };
    if (e.kind !== "proficiency") continue;
    const vocab = VOCAB[e.proficiency_type ?? ""];
    if (!vocab) continue;               // armor/weapon/saving-throw have no closed vocabulary
    if (!vocab.includes(toProfSlug(e.value ?? ""))) bad.push(`${where}: ${e.value}`);
  }
  return bad;
}

describe("authored overlay effect slugs are in vocabulary", () => {
  // `minEffects` is the NON-VACUITY floor, measured on the tree this guard
  // landed on (2014: 11, 2024: 19). It is the permanent form of the one-shot
  // count the brief asked for: a walk that reaches ZERO effect objects returns
  // an empty `bad` list and passes for the wrong reason, which is precisely how
  // a wrong `loadOverlay` call or a lost descent would look. A FLOOR rather
  // than an exact pin, because authoring more effects is the expected direction
  // of travel and must not turn this red.
  it.each([
    { edition: "2014", file: OVERLAY_2014, minEffects: 11 },
    { edition: "2024", file: OVERLAY_2024, minEffects: 19 },
  ])("every authored effect slug is in vocabulary ($edition)", async ({ file, minEffects }) => {
    const overlay = await loadOverlay(file);
    expect(allEffects(overlay).length).toBeGreaterThanOrEqual(minEffects);
    expect(badSlugs(overlay)).toEqual([]);
  });

  it("pins the walked sections against the schema, so a new effects-bearing section cannot slip past", () => {
    expect(SECTIONS_WITH_EFFECTS).toHaveLength(9);
    // The literal length on its own is SELF-REFERENTIAL: it goes red only when
    // someone edits the list above, never when a new section is added to
    // `overlaySchema`, which is the case that actually makes the walk blind.
    // So tie it to the schema. `optional_feature_slugs` is the single declared
    // section that cannot carry effects (it is a record of slug ARRAYS), so the
    // walked list plus that one key must be exactly the schema's key set.
    expect([...SECTIONS_WITH_EFFECTS, "optional_feature_slugs"].sort())
      .toEqual(Object.keys(overlaySchema.shape).sort());
  });
});
