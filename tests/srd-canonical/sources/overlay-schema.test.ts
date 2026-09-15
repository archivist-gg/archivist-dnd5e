import path from "node:path";
import { describe, it, expect } from "vitest";
import { overlaySchema } from "../../../tools/srd-canonical/overlay.schema";
import { loadOverlay } from "../../../tools/srd-canonical/sources/overlay";

const OVERLAY_DIR = path.resolve(__dirname, "../../../tools/srd-canonical/overlays");

describe("overlaySchema", () => {
  it("accepts class_features with action economy", () => {
    const overlay = { class_features: { "action-surge": { action_cost: "special" } } };
    expect(overlaySchema.safeParse(overlay).success).toBe(true);
  });

  /* ⚠️ TRUTH MAINTENANCE, R4-G7 T5. Until this phase the case above also authored
   *   uses: { max: 1, recharge: "short-rest", scales_at: [{ level: 17, value: 2 }] }
   * and asserted `success === true`. `uses` is NOT a declared key on any overlay feature schema and
   * never has been: the shared `featureOverrideSchema` is non-strict, so the whole block was
   * silently stripped and the assertion passed on `action_cost` alone. The limited-use route is
   * `resources[]` (the `overlay resources` describe below), which is what the shipped overlays
   * author. Now that `class_features` has its own STRICT schema the stale shape fails loudly, so it
   * is pinned here in the direction that is actually true. */
  it("REJECTS the legacy `uses:` shape, which the non-strict schema used to strip in silence", () => {
    const legacy = {
      class_features: {
        "action-surge": {
          action_cost: "special",
          uses: { max: 1, recharge: "short-rest", scales_at: [{ level: 17, value: 2 }] },
        },
      },
    };
    expect(overlaySchema.safeParse(legacy).success).toBe(false);
  });

  it("accepts optional_feature_slugs map", () => {
    const overlay = {
      optional_feature_slugs: {
        invocation: ["agonizing-blast", "devil-sight"],
        fighting_style: ["defense", "dueling"],
      },
    };
    expect(overlaySchema.safeParse(overlay).success).toBe(true);
  });

  it("rejects unknown action_cost", () => {
    const bad = { class_features: { x: { action_cost: "magical-action" } } };
    expect(overlaySchema.safeParse(bad).success).toBe(false);
  });

  it("accepts optional_features and feats entries carrying entity-level effects", () => {
    const overlay = {
      optional_features: {
        defense: { effects: [{ kind: "ac-bonus", value: 1, requires_armor: true }] },
      },
      feats: {
        defense: { effects: [{ kind: "ac-bonus", value: 1, requires_armor: true }] },
      },
    };
    expect(overlaySchema.safeParse(overlay).success).toBe(true);
  });

  it("rejects unknown keys inside an entity-effects entry", () => {
    const bad = {
      optional_features: { defense: { effects: [{ kind: "ac-bonus", value: 1 }], bogus: true } },
    };
    expect(overlaySchema.safeParse(bad).success).toBe(false);
  });

  it("rejects empty effects arrays in entity-effects entries", () => {
    const bad = { feats: { defense: { effects: [] } } };
    expect(overlaySchema.safeParse(bad).success).toBe(false);
  });

  it("rejects malformed effects in entity-effects entries", () => {
    const bad = { feats: { defense: { effects: [{ kind: "ac-bonus" }] } } };
    expect(overlaySchema.safeParse(bad).success).toBe(false);
  });
});

describe("overlay resources", () => {
  it("accepts and retains a class feature resources array", () => {
    const r = overlaySchema.safeParse({
      class_features: {
        rage: {
          action_cost: "bonus-action",
          resources: [{
            id: "barbarian:rage", name: "Rage", max_formula: "2",
            scales_at: [{ level: 3, max: "3" }], reset: "long-rest",
          }],
        },
      },
    });
    expect(r.success && r.data.class_features?.rage?.resources?.length).toBe(1);
    expect(r.success && r.data.class_features?.rage?.resources?.[0]?.id).toBe("barbarian:rage");
  });

  it("accepts and retains feat_features and background_features sections", () => {
    const r = overlaySchema.safeParse({
      feat_features: {
        lucky: { resources: [{ id: "feat:lucky", name: "Luck Points", max_formula: "prof", reset: "long-rest" }] },
      },
      background_features: {},
    });
    expect(r.success && r.data.feat_features?.lucky?.resources?.[0]?.id).toBe("feat:lucky");
    expect(r.success && r.data.background_features !== undefined).toBe(true);
  });
});

describe("overlay choices (SP2 Plan 3)", () => {
  it("accepts feature choices, scoped keys, and noChoices opt-out", () => {
    const r = overlaySchema.safeParse({
      class_features: {
        "ability-score-improvement": { choices: [{
          kind: "select-inline", id: "asi-or-feat", count: 1,
          options: [
            { value: "asi", label: "Ability Score Increase",
              choices: [{ kind: "ability-points", id: "asi", points: 2, max_per: 2 }] },
            { value: "feat", label: "Feat",
              choices: [{ kind: "select-entity", id: "feat", entity_type: "feat", count: 1 }] },
          ],
        }] },
        "fighter:fighting-style": { choices: [{
          kind: "select-entity", id: "fighting-style", count: 1,
          entity_type: "optional-feature",
          where: { feature_type: "fighting_style", available_to: "self" },
        }] },
        "spellcasting": { noChoices: true },
      },
    });
    expect(r.success).toBe(true);
  });

  it("accepts entity-level classes/races/backgrounds sections", () => {
    const r = overlaySchema.safeParse({
      classes: { fighter: {
        skill_choices: { count: 2, from: ["acrobatics", "athletics"] },
        starting_equipment: [
          { kind: "choice", options: [
            { label: "(a) chain mail", grants: [{ item: "chain-mail" }] },
            { label: "(b) leather armor, longbow, 20 arrows", grants: [{ item: "leather-armor" }, { item: "longbow" }, { item: "arrow", qty: 20 }] },
          ] },
          { kind: "fixed", grants: [{ item: "light-crossbow" }, { item: "bolt", qty: 20 }] },
        ],
        subclass_level: 3,
        subclass_feature_name: "Martial Archetype",
      } },
      races: { "half-elf": { choices: [
        { kind: "select-proficiency", id: "skills", domain: "skill", count: 2 },
      ] } },
      backgrounds: { acolyte: { choices: [
        { kind: "select-proficiency", id: "languages", domain: "language", count: 2 },
      ] } },
    });
    expect(r.success).toBe(true);
  });

  it("rejects malformed choices", () => {
    expect(overlaySchema.safeParse({
      class_features: { expertise: { choices: [{ kind: "select-proficiency", id: "x", domain: "skill" }] } },
    }).success).toBe(false); // missing count
  });
});

describe("race_traits overlay effects (R4-P3c)", () => {
  it("keeps an effects block on a race trait", () => {
    const parsed = overlaySchema.parse({
      race_traits: { "keen-senses": { effects: [{ kind: "proficiency", proficiency_type: "skill", value: "perception" }] } },
    });
    expect(parsed.race_traits!["keen-senses"].effects).toEqual([
      { kind: "proficiency", proficiency_type: "skill", value: "perception" },
    ]);
  });

  it("REJECTS an unknown key on a race trait instead of silently stripping it", () => {
    expect(() => overlaySchema.parse({ race_traits: { tinker: { totallyBogusKey: 42 } } })).toThrow();
  });

  // R4-G7 T5 (spec §8.1 item 1): class_features left this list when it got its OWN strict
  // schema. The two sections named here are the CONTROL that the SHARED, non-strict
  // featureOverrideSchema was not stiffened underneath them.
  it("still strips an unknown key on feat_features and background_features (the control)", () => {
    const parsed = overlaySchema.parse({
      feat_features: { x: { totallyBogusKey: 42 } },
      background_features: { x: { totallyBogusKey: 42 } },
    });
    expect(parsed.feat_features!.x).toEqual({});
    expect(parsed.background_features!.x).toEqual({});
  });

  it("keeps `effects` OFF the shared feature schema, so feat_features cannot author it", () => {
    // The Critical invariant the race-specific schema exists to hold. feat-merge.ts:92
    // reads `overlaid?.effects`, and its pickOverlay spreads feat_features[slug] into
    // the per-slug record, so an `effects` field added to the SHARED schema would
    // silently become a second, undocumented authoring route for feat effects.
    // The three tests above cannot see that: all of them stay green either way.
    expect(overlaySchema.parse({ feat_features: { lucky: { effects: [{ kind: "ac-bonus", value: 1 }] } } }).feat_features!.lucky)
      .toEqual({});
  });
});

describe("race entity-level override: fixed ability score increases (R4-P4)", () => {
  it("accepts a race override carrying BOTH choices and ability_score_increases", () => {
    const r = overlaySchema.safeParse({ races: { "half-elf": {
      ability_score_increases: [{ ability: "cha", amount: 2 }],
      choices: [{ kind: "ability-points", id: "abilities", points: 2, max_per: 1,
                  pool: ["str","dex","con","int","wis"] }],
    } } });
    expect(r.success).toBe(true);
  });

  it("REJECTS the inert choice-shaped ASI arm", () => {
    const r = overlaySchema.safeParse({ races: { "half-elf": {
      ability_score_increases: [{ choose: 2, pool: ["str","dex"], amount: 1 }],
    } } });
    expect(r.success).toBe(false);
    // Pins WHERE the rejection comes from. Without this the test passes for the
    // wrong reason while `races:` is still the strict choices-only schema, which
    // rejects the unknown `ability_score_increases` key at the ENTRY path. Only a
    // schema that accepts the field and validates it with the NARROW
    // fixedAsiSchema reports the issue inside the array.
    const paths = r.success ? [] : r.error.issues.map(i => i.path.join("."));
    expect(paths.some(p => p.startsWith("races.half-elf.ability_score_increases."))).toBe(true);
  });

  it("still parses the REAL srd-5e.yaml, whose human + half-elf entries carry `choices`", async () => {
    // Constraint on the new schema, not a restatement of the one above: both
    // shipped `races:` entries author ONLY `choices`, so a schema carrying just
    // ability_score_increases rejects them and every loadOverlay of the 2014
    // overlay throws. loadOverlay is async and REJECTS on a schema failure.
    const ov = await loadOverlay(path.join(OVERLAY_DIR, "srd-5e.yaml"));
    expect(ov.races?.human?.choices, "races.human.choices vanished from the parse").toBeDefined();
    expect(ov.races?.["half-elf"]?.choices, "races['half-elf'].choices vanished from the parse").toBeDefined();
  });
});

describe("real overlay: the L19 Epic Boon pick key (R4-P4)", () => {
  // Reads the REAL srd-2024.yaml, deliberately. THREE readers CONSUME the
  // literal string `feat` off the persisted choice block: collectFeatPicks and
  // PCResolver.resolve's feat-to-spell pass (both in pc.resolver.ts) and
  // collectClassFeatAbilityPoints (pc.recalc.ts). ONE more only DETECTS it:
  // collectClassAsiBranch (pc.recalc.ts) tests `typeof block.feat` to spot the
  // feat branch and never reads the value. All four are cited by SYMBOL, not
  // line: a stale `:376` shipped here once already, and these lines move
  // whenever a docblock grows. The count covers readers OF THE FEAT PICK only ·
  // readers of OTHER keys on the same block (resolvePool and resolveChosenInline,
  // both by dynamic id) are outside it, and pc.decision-engine.ts is outside it
  // too because it reads generically by `choice.id`, which is what makes this
  // re-key safe.
  // While this pick was authored `id: epic-boon` the L19
  // selection persisted under `choices[19]["epic-boon"]` and was silently
  // discarded, so the boon never resolved at all. A reader-side test cannot see
  // this: the authored id is inert until the next SRD regeneration, so such a
  // test passes identically with either id. Only parsing the authored file
  // catches a regression here.
  it("the 2024 epic-boon feature offers a pick keyed `feat`, not `epic-boon`", async () => {
    const ov = await loadOverlay(path.join(OVERLAY_DIR, "srd-2024.yaml"));
    // Asserted separately so a RENAMED feature key fails by name here, rather
    // than throwing an anonymous "cannot read properties of undefined" below.
    expect(ov.class_features?.["epic-boon"], "class_features['epic-boon'] is missing from srd-2024.yaml").toBeDefined();
    expect(ov.class_features!["epic-boon"].choices![0].id).toBe("feat");
  });
});

/**
 * R4-G7 T5 · the class-feature `effects` arm and the `creatures:` arm (spec §8.1 items 1 and 4, §15 row 16).
 *
 * Two schemas move here and they must not be confused. `class_features` gets its OWN
 * `classFeatureOverrideSchema` (the `raceTraitOverrideSchema` precedent): an `effects` array plus
 * `.strict()`. The SHARED `featureOverrideSchema` underneath `feat_features` / `background_features`
 * stays exactly as it was, and the control above plus the `feat_features` guard below are what prove
 * it: `feat-merge.ts` already reads `overlaid?.effects`, so widening the shared schema would open a
 * second, undocumented authoring route for feat effects rather than the one route this phase wants.
 *
 * `creatures:` is a NEW top-level section, the first overlay route creature-merge has ever had. It
 * carries only what the upstream Open5e cache cannot supply for the four SRD 5.1 creatures whose
 * `speed` is empty and whose `hit_dice` is null (measured: Donkey, Elf Drow, Gnome Deep, Shrieker),
 * so its entry object is `.strict()` and its two fields are shaped, not free.
 */
describe("class_features effects + the creatures arm (R4-G7 T5)", () => {
  it("KEEPS an authored effects array on a class feature instead of silently stripping it", () => {
    const parsed = overlaySchema.parse({
      class_features: { "fighter:extra-attack": { effects: [{ kind: "extra-attack", count: 1 }] } },
    });
    expect(parsed.class_features!["fighter:extra-attack"].effects)
      .toEqual([{ kind: "extra-attack", count: 1 }]);
  });

  it("keeps the scaling arms on an authored class-feature effect", () => {
    const parsed = overlaySchema.parse({
      class_features: {
        "fighter:extra-attack": {
          effects: [{ kind: "extra-attack", count: 1, scales_at: [{ level: 11, count: 2 }, { level: 20, count: 3 }] }],
        },
        "monk:unarmored-movement": {
          effects: [{ kind: "speed-bonus", mode: "walk", value: 10, scales_at: [{ level: 6, value: 15 }] }],
        },
      },
    });
    expect(parsed.class_features!["fighter:extra-attack"].effects![0])
      .toEqual({ kind: "extra-attack", count: 1, scales_at: [{ level: 11, count: 2 }, { level: 20, count: 3 }] });
    expect(parsed.class_features!["monk:unarmored-movement"].effects![0])
      .toEqual({ kind: "speed-bonus", mode: "walk", value: 10, scales_at: [{ level: 6, value: 15 }] });
  });

  it("REJECTS an unknown key under class_features instead of silently stripping it", () => {
    expect(() => overlaySchema.parse({ class_features: { x: { totallyBogusKey: 42 } } })).toThrow();
  });

  it("REJECTS an empty or malformed class-feature effects array", () => {
    expect(overlaySchema.safeParse({ class_features: { x: { effects: [] } } }).success).toBe(false);
    expect(overlaySchema.safeParse({ class_features: { x: { effects: [{ kind: "extra-attack" }] } } }).success).toBe(false);
  });

  it("accepts a creatures entry carrying speed and an hp formula", () => {
    const parsed = overlaySchema.parse({
      creatures: { donkey: { speed: { walk: 40 }, hp: { formula: "2d8+2" } } },
    });
    expect(parsed.creatures!.donkey).toEqual({ speed: { walk: 40 }, hp: { formula: "2d8+2" } });
  });

  it("REJECTS an unknown key inside a creatures entry, and a malformed hp formula", () => {
    expect(() => overlaySchema.parse({ creatures: { donkey: { totallyBogusKey: 42 } } })).toThrow();
    expect(overlaySchema.safeParse({ creatures: { donkey: { hp: { formula: "2d8 plus 2" } } } }).success).toBe(false);
  });
});
