import { describe, it, expect } from "vitest";
import { ALL_LANGUAGES } from "@archivist-gg/dnd5e/types/choice";
import type { Choice } from "@archivist-gg/dnd5e/types/choice";
import { buildDecisionLedger } from "@archivist-gg/dnd5e/pc/pc.decision-engine";
import type { DecisionItem } from "@archivist-gg/dnd5e/pc/pc.decision-engine";
import type { ResolvedCharacter, ChoiceValue } from "@archivist-gg/dnd5e/pc/pc.types";

// ── why these fixtures are FABRICATED ───────────────────────────────────────
//
// The fixture below (FixtureOpts, fabricate, classItems, values, registry) is
// COPIED from tests/pc-proficiency-exclusion.test.ts and then extended with three
// options this file needs: `heldSkills` and `expertiseSkills` (the two halves of
// `definition.skills`) and `effectFeatures` (extra ResolvedFeature entries, so an
// effect-granted expertise skill can be exercised). Copied rather than shared
// because that file's own claims are pinned on ITS fixture: importing across test
// files would let a change made for this file silently rewrite that one's inputs.
//
// Fabricated rather than driven off a shipped SRD entity for the same reason the
// exclusion file gives: a shipped fixture pins the CURRENT generated tree, so a
// later regeneration turns a correctness assertion into a maintenance chore, and
// the claims here (an Expertise picker offers the skills you HOLD, and never one
// you already have expertise in) are true of every character, not of one class.

/** A minimal registry. The select-proficiency branch never consults it; it exists
 *  because DecisionContext requires one. */
const registry = { search: () => [], getByTypeAndSlug: () => undefined };

interface FixtureOpts {
  /** race `languages.fixed` -> raceLangFixed grants. */
  raceLanguages?: string[];
  /** race entity-level `choices`, persisted under the `race:` namespace. */
  raceChoices?: Choice[];
  /** class `proficiencies.tools.fixed` -> classToolFixed grants. */
  classTools?: string[];
  /** the L1 class feature's `choices`. */
  featureChoices?: Choice[];
  /** persisted class picks for level 1 (`classes[0].choices[1]`). */
  classPersisted?: Record<string, ChoiceValue>;
  /** persisted origin picks, keyed `race:<id>` / `background:<id>`. */
  originChoices?: Record<string, ChoiceValue>;
  /** `definition.overrides`, so a suppression can be exercised. */
  overrides?: Record<string, unknown>;
  /** `definition.skills.proficient` · the skills the character HOLDS (the F1 pool). */
  heldSkills?: string[];
  /** `definition.skills.expertise` · the skills already AT EXPERTISE (the F4 exclusion). */
  expertiseSkills?: string[];
  /** extra ResolvedFeature entries appended to `features`, so a feature whose
   *  `effects` grant a proficiency reaches collectProficiencyEffectGrants. */
  effectFeatures?: unknown[];
}

/** A level-1 dwarf fighter, assembled by cast the same way every other engine
 *  fixture is (dnd5e `tests/` is typechecked by nothing). */
function fabricate(opts: FixtureOpts): ResolvedCharacter {
  const feature = {
    id: "feature", name: "A Feature", description: "Decide something.",
    choices: opts.featureChoices ?? [],
  };
  const entity = {
    slug: "srd-2024_fighter", name: "Fighter",
    // No skill_choices.from -> the L1 skills row is not synthesized, so a
    // domain:"skill" choice under test cannot collide with id "skills".
    skill_choices: { count: 0, from: [] },
    proficiencies: opts.classTools ? { tools: { fixed: opts.classTools } } : undefined,
    features_by_level: { 1: [feature] }, starting_equipment: [],
  };
  const race = opts.raceLanguages || opts.raceChoices
    ? {
      slug: "srd-2014_dwarf", name: "Dwarf",
      languages: { fixed: opts.raceLanguages ?? [] },
      choices: opts.raceChoices ?? [], traits: [],
    }
    : null;
  const definition = {
    name: "T", edition: "2024", race: null, subrace: null, background: null,
    class: [{ name: "[[fighter]]", level: 1, subclass: null, choices: {} }],
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    ability_method: "manual",
    skills: { proficient: opts.heldSkills ?? [], expertise: opts.expertiseSkills ?? [] },
    spells: { known: [], overrides: [] }, equipment: [],
    overrides: opts.overrides ?? {}, origin_choices: opts.originChoices ?? {},
    state: {
      hp: { current: 1, max: 1, temp: 0 }, hit_dice: {}, spell_slots: {}, concentration: null,
      conditions: [], exhaustion: 0, inspiration: 0, feature_uses: {},
    },
  } as unknown as ResolvedCharacter["definition"];
  const cls = {
    entity, level: 1, subclass: null, choices: { 1: opts.classPersisted ?? {} },
  } as unknown as ResolvedCharacter["classes"][number];
  const features = [
    { feature, source: { kind: "class", slug: entity.slug, level: 1 } },
    ...(opts.effectFeatures ?? []),
  ];
  return {
    definition, race, classes: [cls], background: null, feats: [],
    totalLevel: 1, features, spells: [], pools: [], state: definition.state,
  } as unknown as ResolvedCharacter;
}

const classItems = (ledger: ReturnType<typeof buildDecisionLedger>): DecisionItem[] =>
  ledger.classes[0].levels.flatMap((l) => l.items);

const values = (item: DecisionItem): string[] => item.options.map((o) => o.value);

// ───────────────────────────────────────────────────────────────────────────

/** The Rogue/Bard/Ranger shape: pick from what you are PROFICIENT in, and the pick
 *  is expertise. `from_proficient` was read by nothing before R4-G3b §7 F1. */
const EXPERTISE = { kind: "select-proficiency", id: "expertise", count: 2, domain: "skill", from_proficient: true, expertise: true } as const;
/** Knowledge Domain's Blessings of Knowledge: an `expertise` row with an authored
 *  `from` and NO `from_proficient` (the domain grants proficiency AND expertise in
 *  the same breath). Annotated `: Choice` rather than `as const`, because `as const`
 *  makes `from` a readonly tuple and `Choice.from` is `string[]` · a tsc error. */
const KNOWLEDGE: Choice = { kind: "select-proficiency", id: "blessings-of-knowledge", count: 2, domain: "skill", expertise: true,
  from: ["arcana", "history", "nature", "religion"] };

const item = (r: ResolvedCharacter, key: string) => classItems(buildDecisionLedger(r, { registry } as never)).find((i) => i.key === key)!;

describe("F1 · the Expertise pool is the HELD skills", () => {
  it("a Rogue holding 4 skills is offered exactly those 4 (not 18)", () => {
    const r = fabricate({ heldSkills: ["acrobatics", "deception", "stealth", "perception"], featureChoices: [EXPERTISE] });
    const it_ = item(r, "expertise");
    // RED FIRST before Task 4 (dnd5e 05054d1): read all 18 ALL_SKILL_SLUGS entries,
    // with `satisfied` false. The two are asserted TOGETHER because M-26 (the
    // inherited single-set design, where the exclusion drops exactly what the
    // inclusion kept) turns this one diff into `{ options: [], satisfied: true }` ·
    // the PERMANENT row, and both halves have to be visible in it.
    expect({ options: values(it_).sort(), satisfied: it_.satisfied })
      .toEqual({ options: ["acrobatics", "deception", "perception", "stealth"], satisfied: false });
  });
  it("a FRESH character with no held skills has an EMPTY pool and is NOT satisfied (still unresolved)", () => {
    const r = fabricate({ featureChoices: [EXPERTISE] });
    const it_ = item(r, "expertise");
    // `satisfied` read FALSE before Task 4 (dnd5e 05054d1) as well: there was no
    // skill arm in its gate, so this expect passed vacuously. Its kill power is
    // M-27 (`satisfied` witnessed on the PRE-inclusion pool reads true here) and
    // M-26. The assertion that was RED before Task 4 is the empty pool below,
    // which read 18.
    expect(it_.satisfied).toBe(false);
    expect(it_.options).toHaveLength(0);
    expect(it_.status).not.toBe("resolved");
  });
  it("the persisted pick stays visible in its own row (the `mine` exemption)", () => {
    const r = fabricate({ heldSkills: ["stealth"], featureChoices: [EXPERTISE], classPersisted: { expertise: ["stealth"] } });
    // Passed before Task 4 too, on a pool of all 18. It guards the `mine` exemption
    // in the F4 EXCLUSION only: the pick is collected into `skillExpertise`
    // (collectChosenProficiencies buckets an `expertise` row there), so without the
    // exemption the exclusion would hide the character's own pick. It does NOT reach
    // the INCLUSION's half of the exemption, because "stealth" is a held skill here
    // and `effective.skill` alone keeps it · the case below is the one that does.
    expect(values(item(r, "expertise"))).toContain("stealth");
  });
  it("a persisted pick the character does NOT hold survives the F1 INCLUSION (the inclusion's own `mine` clause)", () => {
    // NOT one of the cases this task was handed. Added because a control MEASURED
    // the gap: deleting `|| mine.has(...)` from the INCLUSION leaves every other
    // case in this file green, so that half of the exemption would ship with zero
    // kill power. The fixture is the R4-G3b §7.2.6 residual shape · an expertise
    // pick persisted on a skill the character has no proficiency in · and the row
    // must still show the user's own choice rather than blank out.
    // RED FIRST before Task 4 (dnd5e 05054d1): read all 18.
    const r = fabricate({ featureChoices: [EXPERTISE], classPersisted: { expertise: ["stealth"] } });
    expect(values(item(r, "expertise"))).toEqual(["stealth"]);
  });
});
describe("F4 · a skill already at EXPERTISE is excluded from an expertise row", () => {
  it("Ranger 9: the L9 pool omits the skill picked at L2, and the row is open", () => {
    const r = fabricate({ heldSkills: ["stealth", "survival", "nature"], expertiseSkills: ["stealth"], featureChoices: [EXPERTISE] });
    const it_ = item(r, "expertise");
    // `status` read "unresolved" before Task 4 (no skill exclusion existed), so this
    // expect passed then. Its kill power is M-26, under which the exclusion drops
    // exactly what the inclusion kept, `satisfied` turns true and statusOf reports
    // "resolved". The assertion that was RED before Task 4 is the pool below (18).
    expect(it_.status).not.toBe("resolved");
    expect(values(it_).sort()).toEqual(["nature", "survival"]);
  });
  it("Ranger 9 with EVERY held skill already at expertise: the row is SATISFIED (the `satisfied` shape M-25 narrows · Gate 2 I-3)", () => {
    const r = fabricate({ heldSkills: ["stealth"], expertiseSkills: ["stealth"], featureChoices: [EXPERTISE] });
    const it_ = item(r, "expertise");
    // RED FIRST before Task 4 (dnd5e 05054d1): read false, because the `satisfied`
    // gate covered language and tool only. RED under M-25, which narrows it back.
    expect(it_.satisfied).toBe(true);
    expect(it_.options).toHaveLength(0);
  });
  it("an EFFECT-granted expertise skill is excluded too (the G3a T4 source)", () => {
    const r = fabricate({ heldSkills: ["arcana", "history"], featureChoices: [EXPERTISE],
      effectFeatures: [{ feature: { name: "Scholar", effects: [{ kind: "proficiency", proficiency_type: "skill", value: "arcana", expertise: true }] }, source: { kind: "class", slug: "srd-2024_fighter", level: 1 } }] });
    // RED FIRST before Task 4 (dnd5e 05054d1): read all 18. RED under M-28, which
    // drops the effect source from `skillExpertise` and offers arcana back.
    expect(values(item(r, "expertise"))).toEqual(["history"]);
  });
  it("Knowledge Domain: exclusion WITHOUT inclusion (no from_proficient) · the held-expertise skill vanishes from its four", () => {
    const r = fabricate({ heldSkills: ["arcana"], expertiseSkills: ["arcana"], featureChoices: [KNOWLEDGE] });
    // RED FIRST before Task 4 (dnd5e 05054d1): read all four authored slugs. RED
    // under M-29, which gates the exclusion on `from_proficient` this row lacks.
    expect(values(item(r, "blessings-of-knowledge")).sort()).toEqual(["history", "nature", "religion"]);
  });
  it("a PLAIN skill row (no expertise flag) is NOT excluded (parked by name)", () => {
    const r = fabricate({ heldSkills: ["arcana"], featureChoices: [{ kind: "select-proficiency", id: "plain-skill", count: 1, domain: "skill", from: ["arcana", "history"] }] });
    // Passed before Task 4 too. It pins the PARK (spec §14): neither the F1
    // inclusion (no `from_proficient`) nor the F4 exclusion (no `expertise`) touches
    // a plain skill row, so a held skill is still offered by one.
    expect(values(item(r, "plain-skill"))).toEqual(["arcana", "history"]);
  });
});
describe("CONTROL · language/tool rows are byte-unchanged", () => {
  it("a from-less language row on a Dwarf still excludes the two known languages (the exclusion test's own case)", () => {
    // Passed before Task 4 and after it, byte-identically: 18 languages minus the
    // two the Dwarf grants. Neither new filter can reach a language row, and this
    // is the assertion that says so · it is the exclusion file's own first case,
    // repeated here so a change made for the skill arms cannot break it unnoticed.
    const r = fabricate({ raceLanguages: ["common", "dwarvish"], featureChoices: [{ kind: "select-proficiency", id: "languages", count: 2, domain: "language" }] });
    expect(values(item(r, "languages"))).toEqual(ALL_LANGUAGES.filter((l) => l !== "common" && l !== "dwarvish"));
  });
});
