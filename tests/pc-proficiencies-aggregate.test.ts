import { describe, it, expect } from "vitest";
import { aggregateProficiencies } from "../src/pc/pc.proficiencies";
import { humanizeProficiency, toProfSlug } from "../src/pc/pc.proficiency-normalize";
import type { ResolvedCharacter, ChoiceValue } from "../src/pc/pc.types";
import cls2014 from "../src/srd/data/runtime/class.2014.json";
import bg2024 from "../src/srd/data/runtime/background.2024.json";

// ─────────────────────────────────────────────────────────────────────────────
// R3-P2 D5: the DISPLAY path (`aggregateProficiencies`) must fold chosen picks
// on top of the pre-existing fixed reads. Picks come from the SAME
// select-proficiency choices `collectChosenProficiencies` walks (entity/trait/
// feature/background `choices[]`), NOT `language_proficiencies`.
//
// R4-P3b §14 deleted the "choose N" placeholder limb (`agg.choices`) · unspent
// picks are the BUILDER's subject, so the sheet aggregate no longer reports
// them. The partial-fold property that the deleted placeholder test also
// covered is re-pinned in tests/pc-proficiency-effective.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

interface MakeOpts {
  raceLangFixed?: string[];
  bgLangChoice?: { id: string; count: number; from: string[] };
  bgToolChoice?: { id: string; count: number; from: string[] };
  originChoices?: Record<string, ChoiceValue>;
  /** Class `proficiencies.tools.fixed` · the 2014 prose grant path, read at
   *  pc.proficiencies.ts:60. */
  classToolsFixed?: string[];
  /** Background `tool_proficiencies: [{ kind: "fixed", items }]` · the 2024 slug
   *  grant path, read at pc.proficiencies.ts:69-70. */
  bgToolsFixed?: string[];
}

function makeResolved(opts: MakeOpts = {}): ResolvedCharacter {
  const bgChoices: unknown[] = [];
  if (opts.bgLangChoice) {
    bgChoices.push({
      kind: "select-proficiency", id: opts.bgLangChoice.id, count: opts.bgLangChoice.count,
      domain: "language", from: opts.bgLangChoice.from,
    });
  }
  if (opts.bgToolChoice) {
    bgChoices.push({
      kind: "select-proficiency", id: opts.bgToolChoice.id, count: opts.bgToolChoice.count,
      domain: "tool", from: opts.bgToolChoice.from,
    });
  }
  const background: unknown = bgChoices.length || opts.bgToolsFixed
    ? {
        slug: "test-bg", name: "Test Background", edition: "2024",
        tool_proficiencies: opts.bgToolsFixed ? [{ kind: "fixed", items: opts.bgToolsFixed }] : [],
        language_proficiencies: [],
        choices: bgChoices, feature: { name: "Feature", description: "desc" },
      }
    : null;
  const race: unknown = opts.raceLangFixed
    ? { slug: "test-race", name: "Test Race", languages: { fixed: opts.raceLangFixed }, choices: [], traits: [] }
    : null;
  const classes: unknown[] = opts.classToolsFixed
    ? [{
        entity: {
          slug: "test-class", name: "Test Class",
          proficiencies: { tools: { fixed: opts.classToolsFixed } },
        },
        level: 1, subclass: null, choices: {},
      }]
    : [];
  return {
    definition: { origin_choices: opts.originChoices ?? {} },
    race, classes, background, feats: [], totalLevel: 1,
    features: [], spells: [], pools: [], weaponMasteries: [], state: {},
  } as unknown as ResolvedCharacter;
}

describe("aggregateProficiencies · chosen picks (D5)", () => {
  it("folds resolved picks into languages, alongside the fixed race grant", () => {
    const agg = aggregateProficiencies(
      makeResolved({
        raceLangFixed: ["common"],
        bgLangChoice: { id: "langs", count: 2, from: ["elvish", "dwarvish", "giant"] },
        originChoices: { "background:langs": ["elvish", "dwarvish"] },
      }),
    );
    expect(agg.languages.map((e) => e.label)).toContain("Common");
    expect(agg.languages.map((e) => e.label)).toContain("Elvish");
    expect(agg.languages.map((e) => e.label)).toContain("Dwarvish");
  });

  it("returns an empty array for an empty tool bucket (panel renders None)", () => {
    const agg = aggregateProficiencies(makeResolved({ raceLangFixed: ["common"] }));
    expect(agg.tools).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// R4-P3a T2: the proficiency CANON. The 2014 bundle spells Rogue's tool grant
// with a curly apostrophe (`Thieves’ tools`, U+2019) and the 2024 bundle spells
// the Criminal background's with ASCII (`thieves'-tools`, U+0027). Both are real
// tracked values. Without a fold they title-case to two DIFFERENT strings and a
// single proficiency renders as two rows on the sheet.
// ─────────────────────────────────────────────────────────────────────────────

describe("aggregateProficiencies · apostrophe canon", () => {
  it("folds the 2014 curly-apostrophe class grant and the 2024 slug grant into ONE tools row", () => {
    const resolved = makeResolved({
      classToolsFixed: ["Thieves’ tools"],   // 2014 class prose, U+2019
      bgToolsFixed:    ["thieves'-tools"],   // 2024 background slug, U+0027
    });
    const agg = aggregateProficiencies(resolved);
    expect(agg.tools.map((e) => e.label)).toEqual(["Thieves' Tools"]);
    expect(agg.tools).toHaveLength(1);
  });

  it("exposes the two halves of the canon: an apostrophe-safe humanizer over a folding slugger", () => {
    expect(humanizeProficiency("smith's-tools")).toBe("Smith's Tools");
    expect(toProfSlug("Thieves’ tools")).toBe("thieves'-tools");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// R4-P3b T8: PROVENANCE. All four buckets are `ProficiencyEntry[]` (spec §7.1).
//   - `languages`/`tools` ARE computeEffectiveProficiencies' output, passed
//     through UNMODIFIED. A second composition here is what spec §4.1 exists to
//     eliminate: it is how the sheet would come to render a suppressed value the
//     modal does not.
//   - `armor`/`weapons` are composed in pc.proficiencies.ts under §3.3's SECOND
//     rule (no vocabulary constant): value = raw, label = today's prettyName.
//
// These fixtures read the REAL runtime entities rather than hand-built shells,
// so the strings below are the shipped ones rather than a fixture author's
// guess · that is what makes the ordering assertion a regression guard.
// ─────────────────────────────────────────────────────────────────────────────

const entities = (d: unknown): Array<{ slug: string }> =>
  (Array.isArray(d) ? d : Object.values(d as object)) as Array<{ slug: string }>;

function findEntity(d: unknown, slug: string): unknown {
  const hit = entities(d).find((e) => e.slug === slug || e.slug.endsWith(`_${slug}`));
  if (!hit) throw new Error(`entity not found: ${slug}`);
  return hit;
}

/** `definition` deliberately carries NO `overrides` key: the aggregate must keep
 *  surviving the fixtures spec §4.1 `[Gd-1]` documents. */
function srdResolved(opts: { classes?: unknown[]; background?: unknown }): ResolvedCharacter {
  const classes = (opts.classes ?? []).map((entity) => ({ entity, level: 1, subclass: null, choices: {} }));
  return {
    definition: { origin_choices: {} },
    race: null, classes, background: opts.background ?? null,
    feats: [], totalLevel: classes.length || 1,
    features: [], spells: [], pools: [], weaponMasteries: [], state: {},
  } as unknown as ResolvedCharacter;
}

const rogue2014WithCriminal2024 = (): ResolvedCharacter =>
  srdResolved({ classes: [findEntity(cls2014, "rogue")], background: findEntity(bg2024, "criminal") });
/** 2014 Fighter authors `armor: [shield, light, medium, heavy]` · authored order
 *  is NOT display order, which is the whole point of the ordering test below. */
const fighter = (): ResolvedCharacter => srdResolved({ classes: [findEntity(cls2014, "fighter")] });
const fighterPaladin = (): ResolvedCharacter =>
  srdResolved({ classes: [findEntity(cls2014, "fighter"), findEntity(cls2014, "paladin")] });
const bard2014 = (): ResolvedCharacter => srdResolved({ classes: [findEntity(cls2014, "bard")] });

describe("aggregateProficiencies · provenance on every bucket (R4-P3b §7.1)", () => {
  it("carries EVERY granting entity when two sources grant one value", () => {
    // 2014 Rogue grants "Thieves’ tools" (U+2019); 2024 Criminal grants "thieves'-tools" (U+0027).
    // Both fold to one toProfSlug, so this is ONE value with TWO sources · already shipped, not theoretical.
    const agg = aggregateProficiencies(rogue2014WithCriminal2024());
    const entry = agg.tools.find((e) => e.value === "thieves'-tools")!;
    expect(entry.sources).toEqual(["Rogue", "Criminal"]);
    expect(entry.origin).toBe("grant");
  });

  it("renders armor and weapons exactly as today", () => {
    const agg = aggregateProficiencies(fighter());
    expect(agg.armor.map((e) => e.label)).toContain("Heavy");
  });

  it("no longer leaks the Bard tool-choice PROSE into the fixed tool list", () => {
    // D-D: class choice prose leaking into the fixed tool list. P3a fixed it in the GENERATOR
    // (merger-rules/class-merge.ts:342 filters TOOL_CHOICE_PROSE out of the fixed list), and this
    // assertion was pinned to the OLD rendering because the fix was inert until P4's regen.
    // R4-P4 ran that regen and DISCHARGED the pin: the 2014 Bard now carries a structured
    // select-proficiency over the ten instruments, and its fixed tool list no longer holds prose.
    const agg = aggregateProficiencies(bard2014());
    expect(agg.tools.map((e) => e.label)).not.toContain("Three Musical Instruments Of Your Choice");
    expect(agg.tools.some((e) => /choose|of your choice|one kind of/i.test(e.label))).toBe(false);
    // The positive half, so the negative above cannot pass merely because the grant vanished:
    // the pick survives as a real choice the builder can render.
    const bardChoices = (findEntity(cls2014, "bard") as { choices?: Array<Record<string, unknown>> }).choices ?? [];
    const toolChoice = bardChoices.find((c) => c.id === "tool")!;
    expect(toolChoice).toMatchObject({ kind: "select-proficiency", domain: "tool", count: 3 });
    expect(toolChoice.from).toContain("lute");
  });

  it("keeps armor deduped and label-sorted", () => {
    // The ONLY ordering assertion on armor in either repo. The pre-T8 aggregate
    // returned `[...armor].sort()` over the display strings; dropping that sort
    // while reshaping is a VISIBLE regression on a single-class Fighter sheet
    // (authored shield/light/medium/heavy would render in authored order), and
    // nothing else catches it: every other bucket assertion is toContain/.some.
    expect(aggregateProficiencies(fighter()).armor.map((e) => e.label))
      .toEqual(["Heavy", "Light", "Medium", "Shield"]);
  });

  it("keeps weapons label-sorted", () => {
    // Same guard on the other locally-composed bucket: 2014 Fighter authors
    // `weapons.categories: [simple, martial]`, so authored order renders
    // "Simple, Martial" and display order is "Martial, Simple".
    expect(aggregateProficiencies(fighter()).weapons.map((e) => e.label))
      .toEqual(["Martial", "Simple"]);
  });

  it("collapses a double-granted armor category to ONE row naming BOTH classes", () => {
    // Dedupe half of the same guard, plus the ONLY assertion in either repo on
    // an armor/weapon `sources` value: the pre-T8 bucket was a Set<string> and
    // had no provenance at all, so an aggregate that named "Unknown" or the
    // wrong entity would otherwise stay green everywhere.
    const agg = aggregateProficiencies(fighterPaladin());
    expect(agg.armor.map((e) => e.label)).toEqual(["Heavy", "Light", "Medium", "Shield"]);
    expect(agg.armor.find((e) => e.value === "heavy")).toMatchObject({
      label: "Heavy", origin: "grant", sources: ["Fighter", "Paladin"],
    });
  });

  it("folds two SPELLINGS of one weapon grant into one row", () => {
    // Pins the dedupe KEY, not merely the presence of a dedupe: the pre-T8
    // bucket was a `Set<prettyName(raw)>`, so it collapsed spellings that differ
    // only by separator or apostrophe. Keying the reshaped bucket on the raw
    // value instead of toProfSlug would split them and put two identical-looking
    // rows on the sheet. No shipped class pair spells one category two ways, so
    // this fixture is synthetic on purpose · without it the keying rule is a
    // claim in a comment with nothing holding it.
    const twoSpellings = srdResolved({
      classes: [
        { slug: "a", name: "Alpha", proficiencies: { weapons: { fixed: ["hand crossbows"] } } },
        { slug: "b", name: "Beta", proficiencies: { weapons: { fixed: ["hand-crossbows"] } } },
      ],
    });
    const agg = aggregateProficiencies(twoSpellings);
    expect(agg.weapons.map((e) => e.label)).toEqual(["Hand Crossbows"]);
    expect(agg.weapons[0].sources).toEqual(["Alpha", "Beta"]);
  });

  it("applies an override SUPPRESSION to the sheet bucket, not just to the modal primitive", () => {
    // The pass-through property, asserted behaviourally rather than by identity:
    // languages/tools must be computeEffectiveProficiencies' output untouched.
    // Any second composition inside aggregateProficiencies re-adds the value the
    // user suppressed, and the sheet then disagrees with the modal (spec §4.1).
    const suppressed = rogue2014WithCriminal2024();
    (suppressed.definition as unknown as Record<string, unknown>).overrides = {
      tools: { remove: ["thieves'-tools"] },
    };
    // POSITIVE CONTROL first, or the negative assertion passes vacuously: the
    // pre-T8 bucket held display strings, so `not.toContain(<slug>)` was true
    // whether or not suppression ran.
    expect(aggregateProficiencies(rogue2014WithCriminal2024()).tools.map((e) => e.value))
      .toContain("thieves'-tools");
    expect(aggregateProficiencies(suppressed).tools.map((e) => e.value)).not.toContain("thieves'-tools");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// R4-P3c: a proficiency granted by a feature EFFECT reaches the sheet. Five
// SRD-2014 race traits state a proficiency in prose and grant it through a
// `kind: "proficiency"` effect · before this the effect reached recalc's combat
// gate and nothing else, so the Proficiencies panel never showed the row.
//
// The effect bucket composes LAST, and that is load-bearing rather than
// cosmetic: composeGrantEntries is FIRST-SEEN-WINS on the dedupe key, so an
// existing class or feat grant keeps its shipped `value` and `label` and the
// effect only appends its granting entity's name. Reordering the buckets
// silently RELABELS rows to the effect's spelling.
// ─────────────────────────────────────────────────────────────────────────────

/** A 2014 Rogue whose race grants four weapons through a trait effect.
 *  Rogue's real shipped data is weapons.fixed = ["hand crossbows","longswords",
 *  "rapiers","shortswords"] + categories ["simple"], so `longswords` and
 *  `shortswords` COLLIDE with the effect grant · that collision is the point. */
function highElfRogue(effectValues: string[]) {
  return {
    definition: { overrides: {} },
    classes: [{
      entity: {
        slug: "srd-5e_class_rogue", name: "Rogue",
        proficiencies: {
          armor: ["light"],
          weapons: { fixed: ["hand crossbows", "longswords", "rapiers", "shortswords"], categories: ["simple"] },
          tools: { fixed: [] },
        },
      },
      subclass: null, level: 1, choices: {},
    }],
    race: { slug: "srd-5e_race_high-elf", name: "High Elf", languages: { fixed: [] } },
    background: null, feats: [], pools: [], state: {},
    features: [{
      feature: {
        id: "elf-weapon-training", name: "Elf Weapon Training", activatable: false,
        effects: effectValues.map((value) => ({ kind: "proficiency", proficiency_type: "weapon", value })),
      },
      source: { kind: "race", slug: "srd-5e_race_high-elf" },
    }],
  } as never;
}

describe("aggregateProficiencies · feature-effect grants (R4-P3c)", () => {
  it("renders an effect-granted weapon, and a colliding class spelling stays ONE row", () => {
    const r = highElfRogue(["longswords", "shortswords", "shortbows", "longbows"]);
    const weapons = aggregateProficiencies(r).weapons;
    expect(weapons.map((e) => e.label).join(", "))
      .toBe("Hand Crossbows, Longbows, Longswords, Rapiers, Shortbows, Shortswords, Simple");
    const longswords = weapons.find((e) => e.label === "Longswords")!;
    expect(longswords.sources).toEqual(["Rogue", "High Elf"]); // class first, effect LAST
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// R4-G4 §9.2 · tool expertise Tier A, through the AGGREGATE (the shape both
// plugin consumers read: the sidebar panel and the proficiency modal).
//
// `makeResolved` above cannot author a feature EFFECT, so this fixture is a
// cast, like the ones in tests/pc-proficiency-grants.test.ts. It exercises BOTH
// tool grant paths at once on ONE value: the class `proficiencies.tools.fixed`
// prose grant ("thieves' tools", plain) and the feature effect grant
// ("thieves' tools" with `expertise: true`). They fold to one entry because
// matchPool keys on toProfSlug, so the merge branch in `push` is the only thing
// that can carry the flag through.
// ─────────────────────────────────────────────────────────────────────────────
describe("aggregateProficiencies · tool expertise (R4-G4 §9.2)", () => {
  const rogueWithExpertise = {
    classes: [{
      entity: {
        slug: "rogue", name: "Rogue",
        proficiencies: { tools: { fixed: ["thieves' tools"] } },
      },
      subclass: null, level: 6, choices: {},
    }],
    feats: [], race: null, background: null, pools: [], state: {},
    definition: { origin_choices: {}, overrides: {} },
    features: [{
      feature: {
        id: "t", name: "Expertise",
        effects: [{ kind: "proficiency", proficiency_type: "tool", value: "thieves' tools", expertise: true }],
      },
      source: { kind: "class", slug: "rogue" },
    }],
  } as unknown as ResolvedCharacter;

  it("R4-G4 §9.2: the tools line carries expertise, and a plain grant then an expertise grant ORs to true", () => {
    const tools = aggregateProficiencies(rogueWithExpertise).tools;
    // The expertise read comes FIRST: the length check below would go red for
    // the wrong reason if the two spellings ever stopped folding.
    expect(tools[0]).toMatchObject({ value: "thieves'-tools", expertise: true, sources: ["Rogue"] });
    expect(tools).toHaveLength(1);
  });
});
