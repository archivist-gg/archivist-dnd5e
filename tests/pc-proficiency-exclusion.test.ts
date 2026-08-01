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

/** A minimal registry. The select-proficiency branch never consults it, but this
 *  object is NOT inert: the "does NOT mark an empty-registry select-entity
 *  satisfied" negative below turns on `search` returning [] · that empty result
 *  is precisely what makes the entity choice enumerate zero options. Tests that
 *  need real feats pass their own `featRegistry` instead. */
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

describe("DecisionItem.satisfied: exclusion emptied the pool", () => {
  it("marks a language choice satisfied when every option is already known", () => {
    // The state exclusion newly makes reachable: all 16 languages held, so a
    // from-less count:2 language pick enumerates 16 and excludes 16. There is
    // nothing left to grant, so the row is done rather than an obligation the
    // user could never discharge.
    const ledger = buildDecisionLedger(
      fabricate({
        raceLanguages: [...ALL_LANGUAGES],
        featureChoices: [{ kind: "select-proficiency", id: "languages", count: 2, domain: "language" }],
      }),
      { registry } as never,
    );
    const item = classItems(ledger).find((i) => i.key === "languages")!;
    expect(item.options).toHaveLength(0);          // the pool really is empty
    expect(item.satisfied).toBe(true);
    // §6.2: satisfied RESOLVES. Three step-header counters (background-step,
    // race-step, class-chronicle) count `status === "resolved"` directly, so a
    // row carrying only the boolean would read "1 open" forever.
    expect(item.status).toBe("resolved");
  });

  it("marks a tool choice satisfied when every option is already known", () => {
    // The `|| domain === "tool"` disjunct, pinned on its own: dropping it leaves
    // every language assertion above green.
    const ledger = buildDecisionLedger(
      fabricate({
        classTools: [...ALL_TOOLS],
        featureChoices: [{ kind: "select-proficiency", id: "tool", count: 1, domain: "tool" }],
      }),
      { registry } as never,
    );
    const item = classItems(ledger).find((i) => i.key === "tool")!;
    expect(item.options).toHaveLength(0);
    expect(item.satisfied).toBe(true);
    expect(item.status).toBe("resolved");
  });

  it("does NOT mark a choice with options still on offer satisfied", () => {
    // The `options.length === 0` clause. None of the three negatives below
    // catches its removal: each of them fails an EARLIER clause.
    const ledger = buildDecisionLedger(
      fabricate({
        raceLanguages: ["common"],
        featureChoices: [{ kind: "select-proficiency", id: "languages", count: 2, domain: "language" }],
      }),
      { registry } as never,
    );
    const item = classItems(ledger).find((i) => i.key === "languages")!;
    expect(item.options).toHaveLength(ALL_LANGUAGES.length - 1);
    expect(item.satisfied).toBe(false);
  });

  // ── the three shapes that must NOT be satisfied ────────────────────────────
  //
  // Each ALREADY returns zero options today, so an unscoped
  // `options.length === 0` predicate would flip all three to satisfied and,
  // through the shipped `statusOf`, on to `resolved`: a green ✓ row with an empty
  // summary that the user provably cannot satisfy, and a "0 open" step counter.
  // Nothing else in either suite stands here, so each test asserts the
  // zero-option state itself rather than trusting the fixture to reach it.

  it("does NOT mark a save-domain choice satisfied", () => {
    // domain:"save" enumerates [] by design (saving throws come from the class,
    // never from a decision). Fence F4 keeps satisfied off saves and skills.
    const ledger = buildDecisionLedger(
      fabricate({
        featureChoices: [{ kind: "select-proficiency", id: "saves", count: 1, domain: "save" }],
      }),
      { registry } as never,
    );
    const item = classItems(ledger).find((i) => i.key === "saves")!;
    expect(item.options).toHaveLength(0);
    expect(item.satisfied).toBe(false);
    expect(item.status).toBe("unresolved");
  });

  it("does NOT mark an empty-registry select-entity satisfied", () => {
    // No entity of the type is registered (an empty vault), so the pool is empty
    // for a reason that has nothing to do with what the character already holds.
    const ledger = buildDecisionLedger(
      fabricate({
        featureChoices: [{ kind: "select-entity", id: "weapon-pick", count: 1, entity_type: "weapon" }],
      }),
      { registry } as never,
    );
    const item = classItems(ledger).find((i) => i.key === "weapon-pick")!;
    expect(item.options).toHaveLength(0);
    expect(item.satisfied).toBe(false);
    expect(item.status).toBe("unresolved");
  });

  it("does NOT mark an authored `from: []` language choice satisfied", () => {
    // preExclusionOptions.length > 0 is the clause that catches this one: an
    // authored empty `from` never had anything to offer, so exclusion took
    // nothing away and the choice stays open.
    const ledger = buildDecisionLedger(
      fabricate({
        featureChoices: [{ kind: "select-proficiency", id: "languages", count: 1, domain: "language", from: [] }],
      }),
      { registry } as never,
    );
    const item = classItems(ledger).find((i) => i.key === "languages")!;
    expect(item.options).toHaveLength(0);
    expect(item.satisfied).toBe(false);
    expect(item.status).toBe("unresolved");
  });
});

describe("a satisfied CHILD stops downgrading its parent", () => {
  // `item.status` is MUTATED AFTER construction at buildItem's two recursion
  // sites: a parent that statusOf called `resolved` drops to `partial` when any
  // child is not `resolved`. `satisfied` is computed once and never revisited,
  // and no parent can itself be satisfied (select-inline / select-entity fail
  // the predicate's first clause), so the interaction runs in exactly ONE
  // direction: child satisfied -> child resolved -> parent no longer downgraded.
  //
  // That is the point of the feature (the user cannot discharge the child, so
  // the parent is genuinely done), but before the statusOf flip the child read
  // `unresolved` and dragged the parent to `partial`. Nothing pinned the
  // transition, and each recursion site carries its OWN copy of the downgrade,
  // so both are asserted: deleting either one leaves the other green.

  it("leaves a select-inline parent resolved when its only child is satisfied", () => {
    const ledger = buildDecisionLedger(
      fabricate({
        classTools: [...ALL_TOOLS],
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
    const parent = classItems(ledger).find((i) => i.key === "kit")!;
    const child = parent.children!.find((c) => c.key === "kit-tool")!;
    // The child really is the emptied-by-exclusion shape, not merely zero-option.
    expect(child.options).toHaveLength(0);
    expect(child.satisfied).toBe(true);
    expect(child.status).toBe("resolved");
    // ... so the downgrade at the select-inline recursion site does not fire.
    expect(parent.status).toBe("resolved");
  });

  it("leaves a chosen-feat parent resolved when its only child is satisfied", () => {
    // The Skilled-feat shape the spec uses as its example, at the SECOND
    // downgrade site (the feat-children recursion).
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
        classTools: [...ALL_TOOLS],
        featureChoices: [{ kind: "select-entity", id: "feat-pick", count: 1, entity_type: "feat" }],
        classPersisted: { "feat-pick": "[[srd-2024_skilled]]" },
      }),
      { registry: featRegistry } as never,
    );
    const parent = classItems(ledger).find((i) => i.key === "feat-pick")!;
    const child = parent.children!.find((c) => c.key === "feat:tools")!;
    expect(child.options).toHaveLength(0);
    expect(child.satisfied).toBe(true);
    expect(child.status).toBe("resolved");
    expect(parent.status).toBe("resolved");
  });

  it("still downgrades a parent whose child is genuinely open", () => {
    // The control. Without it the two assertions above pass just as well against
    // a build that deleted the downgrade outright, which would silently mark
    // every parent of an unmade child `resolved`.
    const ledger = buildDecisionLedger(
      fabricate({
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
    const parent = classItems(ledger).find((i) => i.key === "kit")!;
    const child = parent.children!.find((c) => c.key === "kit-tool")!;
    expect(child.options).toHaveLength(ALL_TOOLS.length);   // nothing excluded
    expect(child.satisfied).toBe(false);
    expect(child.status).toBe("unresolved");
    expect(parent.status).toBe("partial");
  });
});
