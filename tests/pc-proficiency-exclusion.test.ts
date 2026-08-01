import { describe, it, expect } from "vitest";
import { ALL_LANGUAGES, ALL_TOOLS, ALL_SKILL_SLUGS } from "@archivist-gg/dnd5e/types/choice";
import type { Choice } from "@archivist-gg/dnd5e/types/choice";
import { buildDecisionLedger } from "@archivist-gg/dnd5e/pc/pc.decision-engine";
import type { DecisionItem } from "@archivist-gg/dnd5e/pc/pc.decision-engine";
import type { ResolvedCharacter, ChoiceValue } from "@archivist-gg/dnd5e/pc/pc.types";
import type { RegisteredEntity } from "@archivist-gg/core";

// ── why these fixtures are FABRICATED ───────────────────────────────────────
//
// Every case here is built from scratch rather than driven off a shipped SRD
// entity. That is deliberate: a shipped fixture pins the CURRENT generated tree,
// so a later regeneration turns a correctness assertion into a maintenance
// chore, and this file's claims (a picker never offers what you already have)
// are true of every character, not of one background. The one real-entity
// assertion this change legitimately moves lives in
// pc-decision-tool-options.test.ts, where the real-Soldier describe already
// carries its REGEN NOTE.

/** A minimal registry: the select-proficiency branch never consults it. */
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
    ability_method: "manual", skills: { proficient: [], expertise: [] },
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
  const features = [{ feature, source: { kind: "class", slug: entity.slug, level: 1 } }];
  return {
    definition, race, classes: [cls], background: null, feats: [],
    totalLevel: 1, features, spells: [], pools: [], state: definition.state,
  } as unknown as ResolvedCharacter;
}

const classItems = (ledger: ReturnType<typeof buildDecisionLedger>): DecisionItem[] =>
  ledger.classes[0].levels.flatMap((l) => l.items);

const values = (item: DecisionItem): string[] => item.options.map((o) => o.value);

// ───────────────────────────────────────────────────────────────────────────

describe("effective-set exclusion: the picker never offers what you already have", () => {
  it("hides languages the character already knows", () => {
    // A Dwarf grants common + dwarvish; a from-less count:2 language choice
    // enumerates all 16. This IS the reported defect: picking dwarvish here
    // burned the choice and the sheet then showed nothing new.
    const ledger = buildDecisionLedger(
      fabricate({
        raceLanguages: ["common", "dwarvish"],
        featureChoices: [{ kind: "select-proficiency", id: "languages", count: 2, domain: "language" }],
      }),
      { registry } as never,
    );
    const item = classItems(ledger).find((i) => i.key === "languages")!;
    expect(item.options).toHaveLength(ALL_LANGUAGES.length - 2);
    expect(values(item)).not.toContain("dwarvish");
    expect(values(item)).not.toContain("common");
    // Order and labels are otherwise untouched: exclusion is a filter, not a rebuild.
    expect(values(item)).toEqual(ALL_LANGUAGES.filter((l) => l !== "common" && l !== "dwarvish"));
  });

  it("re-offers a language the character has SUPPRESSED", () => {
    // Exclusion reads computeEffectiveProficiencies, which subtracts
    // `overrides.languages.remove` INSIDE itself. A suppressed grant is not held,
    // so it must become pickable again · reading the raw grants instead of the
    // effective set would leave it hidden forever.
    const ledger = buildDecisionLedger(
      fabricate({
        raceLanguages: ["common", "dwarvish"],
        overrides: { languages: { remove: ["dwarvish"] } },
        featureChoices: [{ kind: "select-proficiency", id: "languages", count: 2, domain: "language" }],
      }),
      { registry } as never,
    );
    const item = classItems(ledger).find((i) => i.key === "languages")!;
    expect(item.options).toHaveLength(ALL_LANGUAGES.length - 1);
    expect(values(item)).toContain("dwarvish");
    expect(values(item)).not.toContain("common");
  });

  it("NEVER excludes the value selected on THIS choice, comparing canonically", () => {
    // The Volker witness: `race:tool: smith's tools` (spaces) persisted against a
    // pool of `smith's-tools` (hyphens). The pick folds into the effective set,
    // so without a canonical exemption the option is excluded, matchPool then
    // finds nothing, canonicalizeSelection's `?? v` KEEP arm holds the raw string
    // and the strip renders a bare slug with no matching chip · the burned pick,
    // reintroduced inside its own fix.
    const ledger = buildDecisionLedger(
      fabricate({
        raceChoices: [{ kind: "select-proficiency", id: "tool", count: 1, domain: "tool" }],
        originChoices: { "race:tool": "smith's tools" },
      }),
      { registry } as never,
    );
    const item = ledger.origin.find((i) => i.key === "tool")!;
    expect(values(item)).toContain("smith's-tools");
    expect(item.options).toHaveLength(ALL_TOOLS.length);   // nothing else is known
    // The consequences, pinned directly rather than inferred from the count:
    expect(item.selected).toBe("smith's-tools");           // folded onto the pool spelling
    expect(item.status).toBe("resolved");
  });

  it("excludes a sibling choice's pick (decision 6: no double-picking)", () => {
    // The pick lives on a select-inline branch's CHILD; the sibling is top-level.
    // One effective set per ledger is what makes them see each other.
    const ledger = buildDecisionLedger(
      fabricate({
        featureChoices: [
          {
            kind: "select-inline", id: "kit", count: 1, options: [
              {
                value: "musician", label: "Musician", choices: [
                  { kind: "select-proficiency", id: "kit-tool", count: 1, domain: "tool" },
                ],
              },
            ],
          },
          { kind: "select-proficiency", id: "sibling-tool", count: 1, domain: "tool" },
        ],
        classPersisted: { kit: "musician", "kit-tool": "lute" },
      }),
      { registry } as never,
    );
    const sibling = classItems(ledger).find((i) => i.key === "sibling-tool")!;
    expect(values(sibling)).not.toContain("lute");
    expect(sibling.options).toHaveLength(ALL_TOOLS.length - 1);

    // ...and the choice that OWNS the pick still offers it (the exemption again,
    // this time at child scope).
    const child = classItems(ledger).find((i) => i.key === "kit")!.children!
      .find((c) => c.key === "kit-tool")!;
    expect(values(child)).toContain("lute");
  });

  it("excludes a known tool from a select-inline CHILD choice", () => {
    // THE forwarding test. buildItem's contract is "a child inherits NOTHING from
    // its parent", and the select-inline recursion honours it by dropping
    // `description`. `effective` is the deliberate exception: an implementer who
    // follows the local convention and passes an empty set here silently disables
    // exclusion for every child choice, and NOTHING else in either suite notices.
    const ledger = buildDecisionLedger(
      fabricate({
        classTools: ["lute"],
        featureChoices: [{
          kind: "select-inline", id: "kit", count: 1, options: [
            {
              value: "musician", label: "Musician", choices: [
                { kind: "select-proficiency", id: "kit-tool", count: 1, domain: "tool" },
              ],
            },
          ],
        }],
        classPersisted: { kit: "musician" },
      }),
      { registry } as never,
    );
    const child = classItems(ledger).find((i) => i.key === "kit")!.children!
      .find((c) => c.key === "kit-tool")!;
    expect(values(child)).not.toContain("lute");
    expect(child.options).toHaveLength(ALL_TOOLS.length - 1);
  });

  it("excludes a known tool from a chosen-FEAT child choice", () => {
    // The second recursive call site, which drops `description` for the same
    // reason and must forward `effective` for the same reason.
    const feats: RegisteredEntity[] = [{
      slug: "srd-2024_skilled", name: "Skilled", entityType: "feat", filePath: "sk.md",
      data: { choices: [{ kind: "select-proficiency", id: "tools", count: 1, domain: "tool" }] },
      compendium: "Mock", readonly: true, homebrew: false,
    }];
    const featRegistry = {
      search: (_q: string, type: string) => feats.filter((f) => f.entityType === type),
      getByTypeAndSlug: (type: string, slug: string) =>
        feats.find((f) => f.entityType === type && (f.slug === slug || f.slug.endsWith(`_${slug}`))),
    };
    const ledger = buildDecisionLedger(
      fabricate({
        classTools: ["lute"],
        featureChoices: [{ kind: "select-entity", id: "feat-pick", count: 1, entity_type: "feat" }],
        classPersisted: { "feat-pick": "[[srd-2024_skilled]]" },
      }),
      { registry: featRegistry } as never,
    );
    const child = classItems(ledger).find((i) => i.key === "feat-pick")!.children!
      .find((c) => c.key === "feat:tools")!;
    expect(values(child)).not.toContain("lute");
    expect(child.options).toHaveLength(ALL_TOOLS.length - 1);
  });

  it("does NOT touch a skill choice (fence F4)", () => {
    // visitProficiencyChoices is ONE walk and collectChosenProficiencies buckets
    // skills and expertise in the same nested-ternary dispatch, so widening
    // exclusion "for symmetry" would reach the live skill fold in pc.recalc.ts.
    // A picked skill therefore stays on offer in a sibling skill choice.
    const ledger = buildDecisionLedger(
      fabricate({
        featureChoices: [
          { kind: "select-proficiency", id: "skills-a", count: 1, domain: "skill" },
          { kind: "select-proficiency", id: "skills-b", count: 1, domain: "skill" },
        ],
        classPersisted: { "skills-a": "athletics" },
      }),
      { registry } as never,
    );
    const b = classItems(ledger).find((i) => i.key === "skills-b")!;
    expect(b.options).toHaveLength(ALL_SKILL_SLUGS.length);
    expect(values(b)).toContain("athletics");
  });
});
