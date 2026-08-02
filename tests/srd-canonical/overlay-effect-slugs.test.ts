import { describe, it, expect } from "vitest";
import * as path from "node:path";
import { loadOverlay } from "../../tools/srd-canonical/sources/overlay";
import { overlaySchema } from "../../tools/srd-canonical/overlay.schema";
import { ALL_SKILL_SLUGS, ALL_TOOLS, ALL_LANGUAGES } from "../../src/types/choice";
import { toProfSlug } from "../../src/pc/pc.proficiency-normalize";
import { isProficientWithWeapon } from "../../src/pc/pc.proficiency-query";
import weapons2014 from "../../src/srd/data/canonical/weapons.2014.json";
import weapons2024 from "../../src/srd/data/canonical/weapons.2024.json";

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
 *      shipped data: `draconic-ancestry` authors ten such blocks in EACH
 *      overlay (the 2024 file carries 18 nested option-effect blocks in all ·
 *      draconic-ancestry 10, wholeness-of-body 5, fiendish-legacy 3). P3a's
 *      tool-pool guard shipped BLIND for exactly this reason · it walked
 *      `choices` and descended into no option. Descend it.
 *
 * SIX mutation controls, every one OBSERVED RED before this file was trusted:
 * a bogus `value:` at a top-level `race_traits` effect; at a nested
 * `draconic-ancestry` option effect; at `optional_features` (2014); at `feats`
 * (2024, which is what proves the second `it.each` case is live at all); at an
 * effect TWO option-levels deep; and a tenth section added to `overlaySchema`,
 * which is what the section pin below exists to catch.
 *
 * The path constants are deliberately NOT exported. A sibling test file doing
 * `import { OVERLAY_2014 } from "./overlay-effect-slugs.test"` makes vitest
 * re-register THIS file's suites into the importing one · measured at 4 tests
 * where 1 was written. That would silently inflate the phase's test-count
 * tripwire while reading as "tests added". Task 11 extends this file in place.
 */

const OVERLAY_2014 = path.resolve(__dirname, "../../tools/srd-canonical/overlays/srd-5e.yaml");
const OVERLAY_2024 = path.resolve(__dirname, "../../tools/srd-canonical/overlays/srd-2024.yaml");

/** Every overlay section that can carry an `effects` array, top level or nested. */
const SECTIONS_WITH_EFFECTS = [
  "race_traits", "class_features", "feat_features", "background_features",
  "feats", "optional_features", "races", "classes", "backgrounds",
] as const;

/** The three `proficiency_type`s checkable against a flat slug list.
 *  `armor` and `saving-throw` are deliberately left unchecked: neither is
 *  authored by this phase. `weapon` is checked, but NOT from a list · see
 *  `weaponValueResolves`. */
const VOCAB: Record<string, readonly string[]> = {
  skill: ALL_SKILL_SLUGS, tool: ALL_TOOLS, language: ALL_LANGUAGES,
};

interface WeaponLike { slug: string; name: string; category: string }

const WEAPONS: Record<string, WeaponLike[]> = {
  "2014": weapons2014 as unknown as WeaponLike[],
  "2024": weapons2024 as unknown as WeaponLike[],
};

/** The category words the weapon gate can actually see, DERIVED from the
 *  shipped weapon data rather than guessed: every `category` a weapon declares
 *  ("martial-melee", ...) plus its base form, which is what
 *  `isProficientWithWeapon` compares `.categories` against
 *  (`weapon.category.split("-")[0]`).
 *
 *  This reproduces six of the seven entries in `pc.recalc.ts`'s private
 *  `WEAPON_CATEGORY_WORDS`. The seventh is "natural", which no SRD weapon
 *  declares in either edition and which nothing authors · deriving it is not
 *  possible without exporting that constant from `src/`, which is outside this
 *  task's scope. A future overlay authoring `value: natural` therefore gets a
 *  RED here rather than silence, which is the safe direction to fail: the
 *  message names the value, and "natural" grants zero weapons through the gate
 *  anyway (measured: 0 hits in both editions, same as "martial-melee"). */
function weaponCategoryWords(weapons: WeaponLike[]): Set<string> {
  const out = new Set<string>();
  for (const w of weapons) {
    out.add(w.category);
    out.add(w.category.split("-")[0]);
  }
  return out;
}

/** Does an authored weapon `value` resolve to ANYTHING, judged by the
 *  resolver's OWN matcher rather than by a parallel list?
 *
 *  This is strictly stronger than the skill/tool/language checks above, which
 *  compare against a hand-maintained vocabulary that can itself drift. Here the
 *  fold in `pc.recalc.ts:602-606` is reproduced (every value into `.categories`;
 *  a non-category value ALSO into `.specific`) and the real
 *  `isProficientWithWeapon` gate is asked whether any weapon in the edition
 *  comes out proficient.
 *
 *  Why it must be the real matcher and not a slug list: the gate's `.specific`
 *  arm matches `normKey(authored) === normKey(weapon.name)`, and `normKey`
 *  token-SORTS, so the display spelling "hand crossbow" resolves against the
 *  2014 entity name "Crossbow, hand" (both normalize to "crossbow hand"). A
 *  naive slug-equality check would flag that legitimate value as bogus and
 *  block authoring it. Measured, both editions. */
function weaponValueResolves(value: string, weapons: WeaponLike[], categoryWords: Set<string>): boolean {
  const v = value.toLowerCase();
  if (categoryWords.has(v)) return true;
  const empty = { categories: [] as string[], specific: [] as string[] };
  const profs = {
    weapons: { categories: [v], specific: [v] },
    armor: { ...empty },
    tools: { ...empty },
  };
  return weapons.some((w) => isProficientWithWeapon(w as never, profs as never));
}

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

function badSlugs(overlay: unknown, weapons: WeaponLike[]): string[] {
  const categoryWords = weaponCategoryWords(weapons);
  const bad: string[] = [];
  for (const { where, eff } of allEffects(overlay)) {
    const e = eff as { kind?: string; proficiency_type?: string; value?: string };
    if (e.kind !== "proficiency") continue;
    if (e.proficiency_type === "weapon") {
      if (!weaponValueResolves(e.value ?? "", weapons, categoryWords)) bad.push(`${where}: ${e.value}`);
      continue;
    }
    const vocab = VOCAB[e.proficiency_type ?? ""];
    if (!vocab) continue;               // armor/saving-throw are not authored by this phase
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
  ])("every authored effect slug is in vocabulary ($edition)", async ({ edition, file, minEffects }) => {
    const overlay = await loadOverlay(file);
    expect(allEffects(overlay).length).toBeGreaterThanOrEqual(minEffects);
    expect(badSlugs(overlay, WEAPONS[edition])).toEqual([]);
  });

  /* The weapon arm of `badSlugs` is ARMED BUT UNFIRED on real data: no overlay
   * authors a `kind: proficiency` effect yet (all 30 effect objects today are
   * resistance / ac-bonus). So the predicate itself is pinned here in BOTH
   * directions, because a weapon check that silently accepted everything and one
   * that silently rejected everything would both leave the it.each above green.
   *
   * The eight accepted values are exactly the ones R4-P3c task 11 authors, in
   * the plural display spelling the SRD prose uses. A false positive on any of
   * them blocks that task outright, so this is also a machine-check of a
   * verification the spec did by hand. */
  const TASK11_WEAPON_VALUES = [
    "battleaxes", "handaxes", "light hammers", "warhammers",
    "longswords", "shortswords", "shortbows", "longbows",
  ];

  it("the weapon predicate accepts real display spellings and rejects bogus ones, both editions", () => {
    for (const edition of ["2014", "2024"]) {
      const weapons = WEAPONS[edition];
      const words = weaponCategoryWords(weapons);
      const resolves = (v: string): boolean => weaponValueResolves(v, weapons, words);

      const rejected = TASK11_WEAPON_VALUES.filter((v) => !resolves(v));
      expect(rejected, `${edition}: legitimate weapon values rejected`).toEqual([]);

      // Category words stay legitimate even though the hyphenated forms grant
      // nothing through the gate · they are the engine's own vocabulary.
      expect(["simple", "martial", "simple-melee", "martial-ranged"].filter((v) => !resolves(v))).toEqual([]);

      // The token-sorting normKey path: display spelling vs entity name.
      expect(resolves("hand crossbow"), `${edition}: normKey should match the hand-crossbow entity`).toBe(true);

      // And it is not a rubber stamp.
      const accepted = ["not-a-real-weapon", "battleax", "smith's-tools"].filter(resolves);
      expect(accepted, `${edition}: bogus weapon values accepted`).toEqual([]);
    }
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
