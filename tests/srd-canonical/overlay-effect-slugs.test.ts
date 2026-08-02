import { describe, it, expect } from "vitest";
import * as path from "node:path";
import { loadOverlay } from "../../tools/srd-canonical/sources/overlay";
import { overlaySchema } from "../../tools/srd-canonical/overlay.schema";
import { ALL_SKILL_SLUGS, ALL_TOOLS, ALL_LANGUAGES } from "../../src/types/choice";
import { toProfSlug } from "../../src/pc/pc.proficiency-normalize";
import { isWeaponSlugProficient } from "../../src/pc/pc.equipment";
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
 *      race_traits.draconic-ancestry 10, race_traits.fiendish-legacy 3, and
 *      class_features."draconic-sorcery:elemental-affinity" 5). P3a's tool-pool
 *      guard shipped BLIND for exactly this reason · it walked `choices` and
 *      descended into no option. Descend it.
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
 *  ("martial-melee", ...) plus its base form. The live gate tests both · arms
 *  one and two match the base word, arm three the full hyphenated form.
 *
 *  This reproduces six of the seven entries in `pc.recalc.ts`'s private
 *  `WEAPON_CATEGORY_WORDS`. The seventh is "natural", which ZERO SRD weapons
 *  declare in either edition, so it grants nothing through any gate and cannot
 *  be derived from the data. Deliberately left out rather than hardcoded: a
 *  future overlay authoring `value: natural` gets a RED naming the value, which
 *  is a loud false alarm on a value nobody can usefully author · the safe
 *  direction to fail, and cheaper than a production export that would exist
 *  only for it. */
function weaponCategoryWords(weapons: WeaponLike[]): Set<string> {
  const out = new Set<string>();
  for (const w of weapons) {
    out.add(w.category);
    out.add(w.category.split("-")[0]);
  }
  return out;
}

/** Does an authored weapon `value` resolve to ANYTHING, judged by the LIVE
 *  runtime gate rather than by a parallel list?
 *
 *  The gate is `isWeaponSlugProficient` (`pc.equipment.ts`), which is the one
 *  the attack pipeline actually calls (`computeAttacks`, twice). It is NOT
 *  `pc.proficiency-query.ts`'s `isProficientWithWeapon`: that near-twin has
 *  zero production callers, and its third arm compares only the base category
 *  where the live one also accepts the full hyphenated form. The two agree on
 *  every value this guard can see today, but validating against the dead twin
 *  would silently desync the moment someone fixed the live one.
 *
 *  This is strictly stronger than the skill/tool/language checks above, which
 *  compare against a hand-maintained vocabulary that can itself drift. Here the
 *  fold in `pc.recalc.ts:602-606` is reproduced (every value into `.categories`;
 *  a non-category value ALSO into `.specific`) and the gate is asked whether any
 *  weapon in the edition comes out proficient.
 *
 *  Why it must be the real gate and not a slug list: the `.specific` arm matches
 *  `normKey(authored) === normKey(weapon.name)`, and `normKey` token-SORTS, so
 *  the display spelling "hand crossbow" resolves against the 2014 entity name
 *  "Crossbow, hand" (both normalize to "crossbow hand"). A naive slug-equality
 *  check would flag that legitimate value as bogus and block authoring it.
 *  Measured, both editions. */
function weaponValueResolves(value: string, weapons: WeaponLike[], categoryWords: Set<string>): boolean {
  const v = value.toLowerCase();
  if (categoryWords.has(v)) return true;
  const empty = { categories: [] as string[], specific: [] as string[] };
  const profs = {
    weapons: { categories: [v], specific: [v] },
    armor: { ...empty },
    tools: { ...empty },
  };
  return weapons.some((w) => isWeaponSlugProficient(w as never, w.slug, profs as never));
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

/** `bad` is the vocabulary verdict; `checked` is how many effects actually
 *  REACHED a verdict · incremented immediately before each decision, so it can
 *  only be read off the same predicates that produce `bad`. A separate counting
 *  helper would not do: it would keep counting 11 while the real walk skipped
 *  everything, which is the exact hole task 11 was asked to close. */
function badSlugs(overlay: unknown, weapons: WeaponLike[]): { bad: string[]; checked: number } {
  const categoryWords = weaponCategoryWords(weapons);
  const bad: string[] = [];
  let checked = 0;
  for (const { where, eff } of allEffects(overlay)) {
    const e = eff as { kind?: string; proficiency_type?: string; value?: string };
    if (e.kind !== "proficiency") continue;
    if (e.proficiency_type === "weapon") {
      checked++;
      if (!weaponValueResolves(e.value ?? "", weapons, categoryWords)) bad.push(`${where}: ${e.value}`);
      continue;
    }
    const vocab = VOCAB[e.proficiency_type ?? ""];
    if (!vocab) continue;               // armor/saving-throw are not authored by this phase
    checked++;
    if (!vocab.includes(toProfSlug(e.value ?? ""))) bad.push(`${where}: ${e.value}`);
  }
  return { bad, checked };
}

describe("authored overlay effect slugs are in vocabulary", () => {
  // `minEffects` is the NON-VACUITY floor, RE-MEASURED on the committed tree
  // after task 11's data landed: 2014 = 22 effect objects (11 proficiency, 10
  // resistance, 1 ac-bonus); 2024 = 19 (18 resistance, 1 ac-bonus, no
  // proficiency). It is the permanent form of the one-shot count the brief
  // asked for: a walk that reaches ZERO effect objects returns an empty `bad`
  // list and passes for the wrong reason, which is precisely how a wrong
  // `loadOverlay` call or a lost descent would look.
  //
  // A FLOOR rather than an exact pin, because authoring more effects is the
  // expected direction of travel and must not turn this red · but the floor is
  // kept AT the measured count, never left behind at an older one. Task 10
  // measured 11 for 2014; task 11 then added 11 more and, had the number been
  // left alone, the walk could have lost HALF its reach and still passed. So
  // the rule is: author effects, re-measure, raise this. Both numbers here are
  // the output of that re-measure, not a carried-forward guess.
  it.each([
    { edition: "2014", file: OVERLAY_2014, minEffects: 22 },
    { edition: "2024", file: OVERLAY_2024, minEffects: 19 },
  ])("every authored effect slug is in vocabulary ($edition)", async ({ edition, file, minEffects }) => {
    const overlay = await loadOverlay(file);
    expect(allEffects(overlay).length).toBeGreaterThanOrEqual(minEffects);
    expect(badSlugs(overlay, WEAPONS[edition]).bad).toEqual([]);
  });

  /* The SECOND non-vacuity floor, and the one `minEffects` cannot give.
   *
   * `minEffects` is measured off `allEffects`, which is entirely KIND-BLIND: it
   * counts objects, never asks what they are. So if `badSlugs`'s
   * `kind !== "proficiency"` line ever started skipping EVERYTHING (a renamed
   * discriminant, a typo'd literal), `allEffects` would still return all 22 and
   * all 19, that floor would not budge, `bad` would be `[]`, and the test above
   * would pass green for exactly the wrong reason · one predicate in. No value
   * of `minEffects` can ever catch this, which is why it takes a second floor.
   * Task 10 could not pin this: no overlay authored a single proficiency effect,
   * so the true count was ZERO and any floor above it was red on arrival.
   *
   * ELEVEN, not five: eleven is one per authored VALUE (keen-senses 1,
   * menacing 1, dwarven-combat-training 4, elf-weapon-training 4, tinker 1), so
   * it also catches a walk that finds all five traits but drops values WITHIN a
   * trait's `effects` array. A floor of five would only notice whole traits
   * going missing. A floor, not a pin, because authoring more is the expected
   * direction of travel.
   *
   * 2014 ONLY, deliberately. The 2024 overlay authors no proficiency effect at
   * all, so its honest floor is zero · an assertion that cannot fail. Rather
   * than write one, this names the file that carries the data. The 2024 row of
   * the `it.each` above stays covered by its own `minEffects`. */
  it("the vocabulary check actually REACHES the authored proficiency effects (2014)", async () => {
    const overlay = await loadOverlay(OVERLAY_2014);
    expect(badSlugs(overlay, WEAPONS["2014"]).checked).toBeGreaterThanOrEqual(11);
  });

  /* The weapon PREDICATE is pinned here in BOTH directions, because a weapon
   * check that silently accepted everything and one that silently rejected
   * everything would both leave the it.each above green.
   *
   * ⚠️ HISTORY, because the previous wording is now false and the correction is
   * load-bearing. Task 10 wrote this as "ARMED BUT UNFIRED on real data: no
   * overlay authors a `kind: proficiency` effect yet (all 30 effect objects
   * today are resistance / ac-bonus)". True then. FALSE SINCE TASK 11: the 2014
   * overlay now carries ELEVEN proficiency effects, EIGHT of them weapons, and
   * the tree holds 41 effect objects, not 30. That data is exactly what fired
   * the arm.
   *
   * So do NOT read this block as evidence that nothing live exercises the weapon
   * check, and do NOT delete the reach floor above as redundant scaffolding ·
   * that would restore the blind state task 11 closed. The two guard different
   * things and neither implies the other: THIS one pins the predicate against
   * synthetic values, including REJECTIONS, which real data can never
   * demonstrate; the FLOOR pins that real authored data actually reaches it.
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

/**
 * R4-P3c task 11 · the five SRD-2014 race traits that state a proficiency in
 * prose and, until this phase, granted nothing: Elf Keen Senses, Half-Orc
 * Menacing, Dwarf Dwarven Combat Training, High Elf Elf Weapon Training, Rock
 * Gnome Tinker.
 *
 * ⚠️ `EXPECTED` is TRANSCRIBED from the spec's authoring table (§4.13), NOT
 * copied from `merger-rules/race-merge.test.ts`. That file's merge assertion is
 * tautological in its VALUES (it asserts `toEqual(effects)` against the same
 * literal it fed in), so the only real exact-value guard this phase has is two
 * INDEPENDENT transcriptions of one table agreeing. Copy either from the other
 * and that guard silently becomes nothing. Keep them independent.
 *
 * ⚠️ Weapon values are PLURAL, and that is a ruling, not a typo. The attack gate
 * matches through `normKey`, which singularizes tokens, so either spelling
 * arms it · but the sheet dedupes proficiency ROWS on an un-singularized slug,
 * and the class data's `weapons.fixed` display names are plural ("longswords",
 * "shortswords", measured in classes.2014.json). Author the singular and a High
 * Elf Rogue renders "Longsword, Longswords" as two rows · the duplicate-row
 * defect this arc already fixed once for tools.
 *
 * OBSERVED RED before the YAML landed: all five exact-value cases (`effects`
 * undefined) plus the reach floor above (`checked` was 0). Two further controls,
 * both RED on the finished tree and then reverted: raising that floor to 12
 * reported `checked` as exactly 11, and mutating `battleaxes` to `battleaxen` in
 * the overlay produced `race_traits.dwarven-combat-training: battleaxen` out of
 * the LIVE weapon gate · which is what proves these eight weapon spellings are
 * really being resolved rather than walked past.
 */
describe("the five prose-only race proficiency grants are authored exactly", () => {
  const EXPECTED: Record<string, { proficiency_type: string; values: string[] }> = {
    "keen-senses":             { proficiency_type: "skill",  values: ["perception"] },
    "menacing":                { proficiency_type: "skill",  values: ["intimidation"] },
    "dwarven-combat-training": { proficiency_type: "weapon", values: ["battleaxes", "handaxes", "light hammers", "warhammers"] },
    "elf-weapon-training":     { proficiency_type: "weapon", values: ["longswords", "shortswords", "shortbows", "longbows"] },
    "tinker":                  { proficiency_type: "tool",   values: ["tinker's-tools"] },
  };

  const raceTraits = async (): Promise<Record<string, Record<string, unknown>>> =>
    ((await loadOverlay(OVERLAY_2014)).race_traits ?? {}) as Record<string, Record<string, unknown>>;

  it.each(Object.entries(EXPECTED))("authors %s with exact values", async (slug, { proficiency_type, values }) => {
    const rec = (await raceTraits())[slug];
    expect(rec?.effects).toEqual(
      values.map((value) => ({ kind: "proficiency", proficiency_type, value })),
    );
  });

  // `tinker` is the one EDIT among the five · it already carried `noChoices`
  // (the clockwork-device option is an in-play crafting pick, not a build
  // decision). Adding `effects` must not cost it that flag.
  it("keeps tinker's pre-existing noChoices flag", async () => {
    expect((await raceTraits()).tinker?.noChoices).toBe(true);
  });
});
