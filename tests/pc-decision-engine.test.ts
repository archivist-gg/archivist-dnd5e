import { describe, it, expect, vi } from "vitest";
import { buildDecisionLedger, collectChosenProficiencies, __matchesFilterForTest } from "../src/pc/pc.decision-engine";
import type { DecisionItem, DecisionLedger } from "../src/pc/pc.decision-engine";
import { choiceSchema } from "../src/schemas/choice-schema";
import type { ResolvedCharacter } from "../src/pc/pc.types";
import type { Choice } from "../src/types/choice";
import type { RegisteredEntity } from "@archivist-gg/core";

const styles: RegisteredEntity[] = [
  { slug: "archery", name: "Archery", entityType: "optional-feature", filePath: "a.md",
    data: { feature_type: "fighting_style", available_to: ["[[SRD 2024/Classes/Fighter]]"] },
    compendium: "SRD 2024", readonly: true, homebrew: false },
  { slug: "defense", name: "Defense", entityType: "optional-feature", filePath: "d.md",
    data: { feature_type: "fighting_style", available_to: ["[[SRD 2024/Classes/Fighter]]", "[[SRD 2024/Classes/Paladin]]"] },
    compendium: "SRD 2024", readonly: true, homebrew: false },
];

// A minimal sorcerer-flavoured pool for the multiclass pin.
const metamagics: RegisteredEntity[] = [
  { slug: "quickened", name: "Quickened Spell", entityType: "optional-feature", filePath: "q.md",
    data: { feature_type: "metamagic", available_to: ["[[SRD 2024/Classes/Sorcerer]]"] },
    compendium: "SRD 2024", readonly: true, homebrew: false },
  { slug: "subtle", name: "Subtle Spell", entityType: "optional-feature", filePath: "s.md",
    data: { feature_type: "metamagic", available_to: ["[[SRD 2024/Classes/Sorcerer]]"] },
    compendium: "SRD 2024", readonly: true, homebrew: false },
];

const allEntities = [...styles, ...metamagics];
const multiRegistry = {
  search: (_q: string, type: string) => allEntities.filter(s => s.entityType === type),
  getByTypeAndSlug: (type: string, slug: string) =>
    allEntities.find(s => s.entityType === type && s.slug === slug),
};

const registry = {
  search: (_q: string, type: string) => styles.filter(s => s.entityType === type),
  getByTypeAndSlug: (type: string, slug: string) => styles.find(s => s.entityType === type && s.slug === slug),
};

// A feat-aware registry: the engine resolves the chosen feat slug here to read
// its `choices`. Keyed by both the registered slug and the bare slug.
// MODULE-SCOPE because the flatten (R4-P4) moved every ability-points child out
// of the class asi-branch and under the CHOSEN FEAT, so the status, description
// and canonicalization describes all need a feat behind the L4 pick now.
const feats: RegisteredEntity[] = [
  { slug: "srd-2024_ability-score-improvement", name: "Ability Score Improvement",
    entityType: "feat", filePath: "asi.md",
    data: { choices: [{ kind: "ability-points", id: "asi", points: 2, max_per: 2 }] },
    compendium: "SRD 2024", readonly: true, homebrew: false },
  { slug: "srd-2024_magic-initiate", name: "Magic Initiate", entityType: "feat", filePath: "mi.md",
    data: { choices: [
      { kind: "select-inline", id: "spell-list", count: 1, options: [
        { value: "cleric", label: "Cleric" }, { value: "wizard", label: "Wizard" }] },
      { kind: "select-inline", id: "spellcasting-ability", count: 1, options: [
        { value: "int", label: "Intelligence" }, { value: "wis", label: "Wisdom" }] },
    ] },
    compendium: "SRD 2024", readonly: true, homebrew: false },
  { slug: "srd-2024_alert", name: "Alert", entityType: "feat", filePath: "al.md",
    data: { choices: [] }, compendium: "SRD 2024", readonly: true, homebrew: false },
];
const featRegistry = {
  search: (_q: string, type: string) => feats.filter((s) => s.entityType === type),
  getByTypeAndSlug: (type: string, slug: string) =>
    feats.find((s) => s.entityType === type && (s.slug === slug || s.slug.endsWith(`_${slug}`))),
};

function resolvedFighter(level: number, choices: Record<number, Record<string, unknown>> = {}): ResolvedCharacter {
  const fsFeature = {
    id: "fighting-style", name: "Fighting Style", description: "Choose one option…",
    choices: [{ kind: "select-entity", id: "fighting-style", count: 1, entity_type: "optional-feature",
      where: { feature_type: "fighting_style", available_to: "self" } }],
  };
  const asiFeature = {
    id: "ability-score-improvement", name: "Ability Score Improvement", description: "choose one…",
    choices: [{ kind: "select-inline", id: "asi-or-feat", count: 1, options: [
      { value: "asi", label: "ASI", choices: [{ kind: "ability-points", id: "asi", points: 2, max_per: 2 }] },
      { value: "feat", label: "Feat", choices: [{ kind: "select-entity", id: "feat", entity_type: "feat", count: 1 }] },
    ] }],
  };
  const entity = { slug: "srd-2024_fighter", name: "Fighter", skill_choices: { count: 2, from: ["athletics", "perception"] },
    features_by_level: { 1: [fsFeature], 4: [asiFeature] }, starting_equipment: [] };
  const definition = {
    name: "T", edition: "2024", race: null, subrace: null, background: null,
    class: [{ name: "[[fighter]]", level, subclass: null, choices }],
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    ability_method: "manual", skills: { proficient: [], expertise: [] },
    spells: { known: [], overrides: [] }, equipment: [], overrides: {}, origin_choices: {},
    state: { hp: { current: 1, max: 1, temp: 0 }, hit_dice: {}, spell_slots: {}, concentration: null,
      conditions: [], exhaustion: 0, inspiration: 0, feature_uses: {} },
  } as unknown as ResolvedCharacter["definition"];
  const cls = { entity, level, subclass: null, choices } as unknown as ResolvedCharacter["classes"][number];
  const features = Object.entries(entity.features_by_level)
    .filter(([l]) => Number(l) <= level)
    .flatMap(([l, fs]) => fs.map(f => ({ feature: f, source: { kind: "class", slug: entity.slug, level: Number(l) } })));
  return { definition, race: null, classes: [cls], background: null, feats: [],
    totalLevel: level, features, spells: [], pools: [], state: definition.state } as unknown as ResolvedCharacter;
}

/**
 * Fighter (idx 0) + a minimal second class with its own entity slug and a single
 * decision-bearing feature at L1. Used to pin per-class routing in the ledger.
 */
function resolvedMulticlass(): ResolvedCharacter {
  const fsFeature = {
    id: "fighting-style", name: "Fighting Style", description: "Choose one option…",
    choices: [{ kind: "select-entity", id: "fighting-style", count: 1, entity_type: "optional-feature",
      where: { feature_type: "fighting_style", available_to: "self" } }],
  };
  const mmFeature = {
    id: "metamagic", name: "Metamagic", description: "Choose two options…",
    choices: [{ kind: "select-entity", id: "metamagic", count: 2, entity_type: "optional-feature",
      where: { feature_type: "metamagic", available_to: "self" } }],
  };
  const fighter = { slug: "srd-2024_fighter", name: "Fighter",
    skill_choices: { count: 2, from: ["athletics", "perception"] },
    features_by_level: { 1: [fsFeature] }, starting_equipment: [] };
  const sorcerer = { slug: "srd-2024_sorcerer", name: "Sorcerer",
    skill_choices: { count: 2, from: ["arcana", "deception"] },
    features_by_level: { 1: [mmFeature] }, starting_equipment: [] };

  const definition = {
    name: "T", edition: "2024", race: null, subrace: null, background: null,
    class: [
      { name: "[[fighter]]", level: 1, subclass: null, choices: {} },
      { name: "[[sorcerer]]", level: 1, subclass: null, choices: {} },
    ],
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    ability_method: "manual", skills: { proficient: [], expertise: [] },
    spells: { known: [], overrides: [] }, equipment: [], overrides: {}, origin_choices: {},
    state: { hp: { current: 1, max: 1, temp: 0 }, hit_dice: {}, spell_slots: {}, concentration: null,
      conditions: [], exhaustion: 0, inspiration: 0, feature_uses: {} },
  } as unknown as ResolvedCharacter["definition"];

  const classes = [
    { entity: fighter, level: 1, subclass: null, choices: {} },
    { entity: sorcerer, level: 1, subclass: null, choices: {} },
  ] as unknown as ResolvedCharacter["classes"];
  const features = [
    { feature: fsFeature, source: { kind: "class", slug: fighter.slug, level: 1 } },
    { feature: mmFeature, source: { kind: "class", slug: sorcerer.slug, level: 1 } },
  ];
  return { definition, race: null, classes, background: null, feats: [],
    totalLevel: 2, features, spells: [], pools: [], state: definition.state } as unknown as ResolvedCharacter;
}

/**
 * Find a top-level DecisionItem by key in ONE named section of the ledger.
 * `DecisionLedger` is `{classes, origin}` and the two halves are NOT
 * interchangeable: a race-trait or background pick lands in `origin`, a class
 * entity-level / feature-level pick in `classes[i].levels[].items`. The section
 * is therefore passed EXPLICITLY · a helper that only walked one half would
 * return undefined for the other and fail a test for the wrong reason. Missing
 * keys throw with the section's actual key list, so "searched the wrong half"
 * can never be mistaken for "got the wrong value". Children are not searched;
 * reach into `.children` at the call site.
 */
function findItem(ledger: DecisionLedger, section: "origin" | "classes", key: string): DecisionItem {
  const items = section === "origin"
    ? ledger.origin
    : ledger.classes.flatMap((c) => c.levels.flatMap((l) => l.items));
  const hit = items.find((i) => i.key === key);
  if (!hit) throw new Error(`no DecisionItem "${key}" in ledger.${section} · keys: ${items.map((i) => i.key).join(", ")}`);
  return hit;
}

describe("buildDecisionLedger — multiclass routing", () => {
  it("routes each class's decisions under its own classIndex; skills only on class 0", () => {
    const ledger = buildDecisionLedger(resolvedMulticlass(), { registry: multiRegistry } as never);

    expect(ledger.classes.length).toBe(2);

    const class0Items = ledger.classes[0].levels.flatMap(l => l.items);
    const class1Items = ledger.classes[1].levels.flatMap(l => l.items);

    // Synthesized L1 skills decision is first-class-only (multiclass rules are Plan 5).
    expect(class0Items.filter(i => i.key === "skills")).toHaveLength(1);
    expect(class1Items.filter(i => i.key === "skills")).toHaveLength(0);

    // Fighter's fighting-style lands under class 0, never class 1.
    expect(class0Items.find(i => i.key === "fighting-style")).toBeDefined();
    expect(class1Items.find(i => i.key === "fighting-style")).toBeUndefined();
    expect(class0Items.find(i => i.key === "metamagic")).toBeUndefined();

    // Sorcerer's metamagic lands under class 1, never class 0.
    const mm = class1Items.find(i => i.key === "metamagic")!;
    expect(mm).toBeDefined();
    expect(mm.options.map(o => o.value)).toEqual(["quickened", "subtle"]);
  });
});

describe("buildDecisionLedger — feature-level", () => {
  it("collects level-gated decisions with unresolved status", () => {
    const ledger = buildDecisionLedger(resolvedFighter(1), { registry } as never);
    const items = ledger.classes[0].levels.flatMap(l => l.items);
    const fs = items.find(i => i.key === "fighting-style")!;
    expect(fs.level).toBe(1);
    expect(fs.status).toBe("unresolved");
    expect(fs.options.map(o => o.value)).toEqual(["archery", "defense"]);
    // The L4 decision is keyed `feat` post-flatten; asserting the OLD `asi-or-feat`
    // key here would be permanently true and would guard nothing.
    expect(items.find(i => i.key === "feat")).toBeUndefined(); // L4 not reached
  });

  it("joins persisted selections → resolved, including the flattened L4 feat pick", () => {
    const ledger = buildDecisionLedger(
      resolvedFighter(4, { 1: { "fighting-style": "defense" }, 4: { feat: "alert" } }),
      { registry } as never);
    const items = ledger.classes[0].levels.flatMap(l => l.items);
    expect(items.find(i => i.key === "fighting-style")!.status).toBe("resolved");
    // The authored two-step is normalized away: no `asi-or-feat` row and no
    // revealed `asi` child, just the flat feat pick. (The select-inline
    // child-reveal path itself is covered by the `kit` fixtures in
    // pc-proficiency-exclusion.test.ts and by Magic Initiate below.)
    expect(items.find(i => i.key === "asi-or-feat")).toBeUndefined();
    const feat = items.find(i => i.key === "feat")!;
    expect(feat.status).toBe("resolved");
  });

  it("marks partial allocations and unresolvable from-slugs", () => {
    // Post-flatten the only ability-points child under a class level is the
    // CHOSEN feat's own, so the 1-of-2 partial is asserted through `feat:asi`.
    const ledger = buildDecisionLedger(
      resolvedFighter(4, { 4: { feat: "[[srd-2024_ability-score-improvement]]", "feat:asi": { str: 1 } } }),
      { registry: featRegistry } as never);
    const feat = ledger.classes[0].levels.flatMap(l => l.items).find(i => i.key === "feat")!;
    expect(feat.children?.[0].status).toBe("partial"); // 1 of 2 points
  });

  it("synthesizes the L1 skills decision from class.skill_choices", () => {
    const ledger = buildDecisionLedger(resolvedFighter(1), { registry } as never);
    const sk = ledger.classes[0].levels.flatMap(l => l.items).find(i => i.key === "skills")!;
    expect(sk.level).toBe(1);
    expect(sk.choice.kind).toBe("select-proficiency");
    expect(sk.options).toHaveLength(2);
  });
});

// ⚠️ A LOCAL copy of the two-step fixture, deliberately duplicated from
// tests/pc-asi-flatten.test.ts. MEASURED: importing any symbol from a vitest
// test file re-registers and RE-RUNS that file's whole suite inside the
// importer, silently inflating every recorded suite count.
const TWO_STEP_LOCAL = {
  kind: "select-inline", id: "asi-or-feat", count: 1,
  options: [
    { value: "asi", label: "Ability Score Increase",
      choices: [{ kind: "ability-points", id: "asi", points: 2, max_per: 2 }] },
    { value: "feat", label: "Feat",
      choices: [{ kind: "select-entity", id: "feat", entity_type: "feat", count: 1 }] },
  ],
} as Choice;

describe("asi-or-feat normalization", () => {
  it("the class FEATURE walk yields one flat item keyed `feat`, with no children until picked", () => {
    const ledger = buildDecisionLedger(resolvedFighter(4), { registry } as never);
    const items = ledger.classes[0].levels.find(l => l.level === 4)!.items;
    expect(items.map(i => i.key)).toEqual(["feat"]);
    expect(items[0].choice).toMatchObject({ kind: "select-entity", entity_type: "feat" });
    expect(items[0].children).toBeUndefined();
  });

  it("pushOrigin's walk normalizes an entity-level asi-or-feat on a race", () => {
    const c = resolvedFighter(1);
    (c as { race: unknown }).race = {
      slug: "hb_race_test", name: "Test", traits: [],
      choices: [structuredClone(TWO_STEP_LOCAL)],     // local copy, NOT imported from the other test file
    };
    const keys = buildDecisionLedger(c, { registry } as never).origin.map(i => i.key);
    expect(keys).toContain("feat");
    expect(keys).not.toContain("asi-or-feat");
  });
});

describe("buildDecisionLedger — decision descriptions (smoke r7)", () => {
  it("threads the source class feature's description onto the DecisionItem", () => {
    const ledger = buildDecisionLedger(resolvedFighter(1), { registry } as never);
    const fs = ledger.classes[0].levels.flatMap(l => l.items).find(i => i.key === "fighting-style")!;
    // resolvedFighter's Fighting Style feature carries description "Choose one option…".
    expect(fs.description).toBe("Choose one option…");
  });

  it("threads an origin race-trait's description onto its origin DecisionItem; children inherit none", () => {
    const c = resolvedFighter(1);
    const race = {
      slug: "srd-2024_elf", name: "Elf", choices: [],
      traits: [{
        name: "Elven Lineage",
        description: "Choose a lineage.\n\n| Lineage | Benefit |\n| --- | --- |\n| Drow | Darkvision |",
        choices: [{
          kind: "select-inline", id: "elven-lineage", count: 1,
          options: [{ value: "drow", label: "Drow" }, { value: "wood-elf", label: "Wood Elf" }],
        }],
      }],
    };
    (c as { race: unknown }).race = race;
    const ledger = buildDecisionLedger(c, { registry } as never);
    const lineage = ledger.origin.find(i => i.key === "elven-lineage")!;
    expect(lineage.description).toContain("| Lineage | Benefit |");   // the pipe table is carried verbatim
    // A select-inline child reveals when its parent option is chosen; it inherits
    // NO description (the Choice union has no description field).
    (c.definition as { origin_choices: Record<string, unknown> }).origin_choices = {};
  });

  it("a revealed child carries no inherited description", () => {
    // The flatten (R4-P4) drops the select-inline wrapper, so the ASI feature's
    // description now lands on the FLAT feat item and the revealed child is the
    // chosen feat's own `feat:asi`. Both recursion sites obey the same contract:
    // a child inherits NO description.
    const choices = { 4: { feat: "[[srd-2024_ability-score-improvement]]" } };
    const ledger = buildDecisionLedger(resolvedFighter(4, choices), { registry: featRegistry } as never);
    const feat = ledger.classes[0].levels.flatMap(l => l.items).find(i => i.key === "feat")!;
    expect(feat.description).toBe("choose one…");           // the parent feature's description
    expect(feat.children?.[0].description).toBeUndefined(); // the child inherits nothing
  });
});

describe("buildDecisionLedger — starting equipment", () => {
  it("synthesizes an equipment-0 decision from a choice entry; ignores fixed entries", () => {
    const c = resolvedFighter(1);
    // Structured shape (Task B3): each option carries a label + grants.
    (c.classes[0].entity as { starting_equipment: unknown[] }).starting_equipment = [
      { kind: "choice", options: [
        { label: "(a) X", grants: [{ item: "x" }] },
        { label: "(b) Y", grants: [{ gold: 10 }] },
      ] },
      { kind: "fixed", grants: [{ item: "pack" }] },
    ];
    const ledger = buildDecisionLedger(c, { registry } as never);
    const items = ledger.classes[0].levels.flatMap(l => l.items);
    const eq = items.find(i => i.key === "equipment-0")!;
    expect(eq).toBeDefined();
    expect(eq.level).toBe(1);
    expect(eq.choice.kind).toBe("select-inline");
    expect(eq.options.map(o => o.label)).toEqual(["(a) X", "(b) Y"]);
    // The fixed entry yields no decision.
    expect(items.find(i => i.key === "equipment-1")).toBeUndefined();
  });
});

describe("buildDecisionLedger — recognizer fallback wiring", () => {
  // A class whose features carry NO authored choices, so the engine must
  // consult recognizeDecision (the homebrew fallback path).
  function homebrewClass(): ResolvedCharacter {
    const expertiseFeature = {
      id: "expertise", name: "Expertise", description: "Choose two of your skill proficiencies…",
    };
    const proseFeature = {
      id: "spooky-echo", name: "Spooky Echo", description: "Choose one of the following echoes.",
    };
    const entity = { slug: "hb_rogue", name: "Rogue",
      skill_choices: { count: 0, from: [] },
      features_by_level: { 1: [expertiseFeature, proseFeature] }, starting_equipment: [] };
    const definition = {
      name: "T", edition: "2024", race: null, subrace: null, background: null,
      class: [{ name: "[[rogue]]", level: 1, subclass: null, choices: {} }],
      abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      ability_method: "manual", skills: { proficient: [], expertise: [] },
      spells: { known: [], overrides: [] }, equipment: [], overrides: {}, origin_choices: {},
      state: { hp: { current: 1, max: 1, temp: 0 }, hit_dice: {}, spell_slots: {}, concentration: null,
        conditions: [], exhaustion: 0, inspiration: 0, feature_uses: {} },
    } as unknown as ResolvedCharacter["definition"];
    const cls = { entity, level: 1, subclass: null, choices: {} } as unknown as ResolvedCharacter["classes"][number];
    const features = [
      { feature: expertiseFeature, source: { kind: "class", slug: entity.slug, level: 1 } },
      { feature: proseFeature, source: { kind: "class", slug: entity.slug, level: 1 } },
    ];
    return { definition, race: null, classes: [cls], background: null, feats: [],
      totalLevel: 1, features, spells: [], pools: [], state: definition.state } as unknown as ResolvedCharacter;
  }

  it("synthesizes a select-proficiency item for a feature mapped by id", () => {
    const ledger = buildDecisionLedger(homebrewClass(), { registry } as never);
    const exp = ledger.classes[0].levels.flatMap(l => l.items).find(i => i.key === "expertise")!;
    expect(exp).toBeDefined();
    expect(exp.choice.kind).toBe("select-proficiency");
    expect(exp.status).toBe("unresolved");
  });

  it("emits an informational item for unmapped decision prose", () => {
    const ledger = buildDecisionLedger(homebrewClass(), { registry } as never);
    const echo = ledger.classes[0].levels.flatMap(l => l.items).find(i => i.featureName === "Spooky Echo")!;
    expect(echo).toBeDefined();
    expect(echo.status).toBe("informational");
    expect(echo.options).toEqual([]);
  });

  // Pins `!choices?.length`: an EMPTY ARRAY must behave like undefined, so a
  // recognizer-mapped feature still gets its synthesized decision.
  it("treats an empty choices array like undefined for recognizer-mapped features", () => {
    const c = homebrewClass();
    const expertise = c.features.find(f => f.feature.id === "expertise")!.feature as { choices?: unknown[] };
    expertise.choices = [];
    const ledger = buildDecisionLedger(c, { registry } as never);
    const exp = ledger.classes[0].levels.flatMap(l => l.items).find(i => i.key === "expertise")!;
    expect(exp).toBeDefined();
    expect(exp.choice.kind).toBe("select-proficiency");
    expect(exp.status).toBe("unresolved");
  });
});

describe("collectChosenProficiencies", () => {
  it("folds chosen L1 skills (first class) into skills, dropping stale slugs", () => {
    // from = ["athletics", "perception"]; "arcana" is outside the pool → dropped.
    const c = resolvedFighter(1, { 1: { skills: ["athletics", "perception", "arcana"] } });
    const out = collectChosenProficiencies(c);
    expect(out.skills.sort()).toEqual(["athletics", "perception"]);
    expect(out.skills).not.toContain("arcana");
    expect(out.expertise).toEqual([]);
  });

  it("routes an expertise select-proficiency decision into expertise", () => {
    const c = resolvedFighter(1);
    // Inject an expertise feature at L1 carrying a select-proficiency choice.
    const expFeature = {
      id: "expertise", name: "Expertise", description: "Pick two.",
      choices: [{ kind: "select-proficiency", id: "expertise", count: 2, domain: "skill",
        expertise: true, from: ["athletics", "stealth"] }],
    };
    (c.classes[0].entity as { features_by_level: Record<number, unknown[]> }).features_by_level[1].push(expFeature);
    c.features.push({ feature: expFeature, source: { kind: "class", slug: "srd-2024_fighter", level: 1 } } as never);
    c.classes[0].choices[1] = { ...(c.classes[0].choices[1] ?? {}), expertise: ["athletics"] } as never;
    const out = collectChosenProficiencies(c);
    expect(out.expertise).toEqual(["athletics"]);
    expect(out.skills).not.toContain("athletics");
  });

  it("walks a nested select-inline branch to collect a tool pick", () => {
    const c = resolvedFighter(1);
    const inlineFeature = {
      id: "trade", name: "Guild Trade", description: "Choose a guild.",
      choices: [{ kind: "select-inline", id: "trade", options: [
        { value: "smith", label: "Smith", choices: [
          { kind: "select-proficiency", id: "smith-tool", count: 1, domain: "tool",
            from: ["smiths-tools", "tinkers-tools"] },
        ] },
      ] }],
    };
    (c.classes[0].entity as { features_by_level: Record<number, unknown[]> }).features_by_level[1].push(inlineFeature);
    c.features.push({ feature: inlineFeature, source: { kind: "class", slug: "srd-2024_fighter", level: 1 } } as never);
    c.classes[0].choices[1] = { ...(c.classes[0].choices[1] ?? {}), trade: "smith", "smith-tool": ["smiths-tools"] } as never;
    const out = collectChosenProficiencies(c);
    expect(out.tools).toEqual(["smiths-tools"]);
  });

  it("collects an origin race-trait language pick into languages", () => {
    const c = resolvedFighter(1);
    const race = {
      slug: "srd-2024_half-elf", name: "Half-Elf",
      choices: [],
      traits: [{ name: "Versatile", choices: [
        { kind: "select-proficiency", id: "extra-language", count: 1, domain: "language",
          from: ["elvish", "dwarvish"] },
      ] }],
    };
    (c as { race: unknown }).race = race;
    (c.definition as { origin_choices: Record<string, unknown> }).origin_choices = { "race:extra-language": ["elvish"] };
    const out = collectChosenProficiencies(c);
    expect(out.languages).toEqual(["elvish"]);
  });

  // The live-vault case: a character note persists the 2014 Dwarf tool pick in
  // prose ("smith's tools") while the pool is re-slugged to "smith's-tools".
  // Exact `includes` drops the pick, and the loss is INVISIBLE because the sheet
  // renders no pending-choice marker. The pick fold (collectChosenProficiencies)
  // must canonicalize the prose spelling to the pool's, or the pick is silently
  // lost and the language never reaches the sheet.
  it("keeps a legacy prose pick when the pool has been re-slugged, folding it to the pool spelling", () => {
    const c = resolvedFighter(1);
    const race = {
      slug: "srd-2014_dwarf", name: "Dwarf",
      choices: [],
      traits: [{ name: "Tool Proficiency", choices: [
        { kind: "select-proficiency", id: "tool", count: 1, domain: "tool",
          from: ["smith's-tools", "brewer's-supplies", "mason's-tools"] },
      ] }],
    };
    (c as { race: unknown }).race = race;
    (c.definition as { origin_choices: Record<string, unknown> }).origin_choices = { "race:tool": "smith's tools" };
    const out = collectChosenProficiencies(c);
    expect(out.tools).toEqual(["smith's-tools"]);          // survives AND is canonicalized
  });
});

// ── entity-level class choices (ClassEntity.choices) ────────────────────────
//
// `RaceEntity.choices` and `BackgroundEntity.choices` have always been walked;
// classes were the sole holdout, so a Bard's "three musical instruments of your
// choice" had nowhere to live (none of its L1 features can host a tool pick).
// Two properties are pinned here and they fail for DIFFERENT reasons:
//   1. WHERE the item lands · `ledger.classes[0].levels`, never `ledger.origin`.
//      A class entity-level pick is the mirror image of a race-trait pick.
//   2. WHICH primitive walks it · the RECURSIVE `walk`, not the flat `visit` the
//      synthesized skill row uses. The flat primitive is right for that row only
//      because a synthesized row can never nest; an authored select-inline can,
//      and a flat visit drops its sub-choices SILENTLY (the pick simply never
//      folds into the sheet's proficiencies). Only the nested case below can
//      tell the two primitives apart.
describe("buildDecisionLedger · entity-level class choices", () => {
  /** Fighter carrying `choices` on the class ENTITY itself (the field wired in
   *  task 6a), plus the persisted picks. Picks live under
   *  `classes[0].choices[1]` · the flat per-level namespace `readAt(1)` indexes.
   *  Ids deliberately avoid "skills": the synthesized L1 skill row hardcodes
   *  that id in the SAME namespace, so a class-authored `id: "skills"` would
   *  collide exactly. */
  function fighterWithClassChoices(
    choices: unknown[],
    persisted: Record<string, unknown> = {},
  ): ResolvedCharacter {
    const c = resolvedFighter(1);
    (c.classes[0].entity as unknown as { choices: unknown[] }).choices = choices;
    c.classes[0].choices[1] = { ...(c.classes[0].choices[1] ?? {}), ...persisted } as never;
    return c;
  }

  it("emits a flat entity-level choice into ledger.classes at L1 and folds the pick", () => {
    const c = fighterWithClassChoices(
      [{ kind: "select-proficiency", id: "bard-instruments", label: "Musical Instruments",
        count: 1, domain: "tool", from: ["lute", "drum"] }],
      { "bard-instruments": "lute" },
    );
    const ledger = buildDecisionLedger(c, { registry } as never);

    const item = findItem(ledger, "classes", "bard-instruments");   // classes, NOT origin
    expect(item.level).toBe(1);
    expect(item.featureName).toBe("Proficiencies");
    expect(item.selected).toBe("lute");
    expect(item.status).toBe("resolved");
    // Pin the SECTION, not just "somewhere in the ledger": a class entity-level
    // item belongs to classIndex 0's level 1, and origin must stay untouched.
    const l1 = ledger.classes.find((k) => k.classIndex === 0)!.levels.find((l) => l.level === 1)!;
    expect(l1.items.map((i) => i.key)).toContain("bard-instruments");
    expect(ledger.origin.map((i) => i.key)).not.toContain("bard-instruments");
    // And the pick must reach the sheet's proficiency fold, not just the builder.
    expect(collectChosenProficiencies(c).tools).toEqual(["lute"]);
  });

  it("recurses into the selected branch's nested sub-choice (walk, not visit)", () => {
    const c = fighterWithClassChoices(
      [{ kind: "select-inline", id: "bard-tradition", label: "Tradition", count: 1, options: [
        { value: "minstrel", label: "Minstrel", choices: [
          { kind: "select-proficiency", id: "minstrel-instrument", count: 1, domain: "tool",
            from: ["lute", "viol"] },
        ] },
        { value: "skald", label: "Skald", choices: [
          { kind: "select-proficiency", id: "skald-instrument", count: 1, domain: "tool",
            from: ["horn", "drum"] },
        ] },
      ] }],
      { "bard-tradition": "minstrel", "minstrel-instrument": "viol" },
    );
    const ledger = buildDecisionLedger(c, { registry } as never);

    const parent = findItem(ledger, "classes", "bard-tradition");
    const child = parent.children?.find((k) => k.key === "minstrel-instrument");
    expect(child).toBeDefined();
    expect(child!.selected).toBe("viol");
    expect(parent.status).toBe("resolved");                 // branch + its child both picked
    // The unselected branch's sub-choice must stay hidden (revealed-on-selection).
    expect(parent.children?.map((k) => k.key)).not.toContain("skald-instrument");
    // THE discriminator between `walk` and `visit`: a flat visit emits the
    // select-inline itself and stops, so the nested tool pick never folds.
    expect(collectChosenProficiencies(c).tools).toEqual(["viol"]);
  });

  // The OTHER property entity-level choices mirror from the synthesized skill row
  // (the first is the "Proficiencies" header): the `classIndex === 0` / `i === 0`
  // guard, because multiclass proficiency rules are Plan 5. The sibling skill
  // row's identical guard is pinned by the "multiclass routing" describe above;
  // without this case BOTH new guards could be deleted and the entire
  // suite would stay green, so the mirrored property would be asserted in prose
  // with nothing able to see it. Covers both emission sites at once: the ledger
  // half and the fold half fail independently.
  it("ignores entity-level choices on a SECOND class (first class only)", () => {
    const c = resolvedMulticlass();
    (c.classes[1].entity as unknown as { choices: unknown[] }).choices = [
      { kind: "select-proficiency", id: "sorcerer-tools", count: 1, domain: "tool",
        from: ["lute", "drum"] },
    ];
    (c.classes[1] as unknown as { choices: Record<number, unknown> }).choices[1] = { "sorcerer-tools": "lute" };

    const ledger = buildDecisionLedger(c, { registry: multiRegistry } as never);
    // Ledger half: no item under the second class...
    expect(ledger.classes[1].levels.flatMap((l) => l.items).map((i) => i.key)).not.toContain("sorcerer-tools");
    // ...and it must not leak onto the FIRST class either (a push that read
    // classes[0].entity instead of the loop's entity would land here).
    expect(ledger.classes[0].levels.flatMap((l) => l.items).map((i) => i.key)).not.toContain("sorcerer-tools");
    // Fold half: the sheet must not grant the proficiency either.
    expect(collectChosenProficiencies(c).tools).toEqual([]);
  });
});

// ── DecisionItem.selected canonicalization ──────────────────────────────────
//
// The collectors above fixed the SHEET half. `DecisionItem.selected` is the
// BUILDER half, and it was still the raw persisted value: the strip seeds
// `new Set(selectedSlugs(item))` from it and highlights a chip with
// `selected.has(o.value)` against the POOL's spelling. A legacy pick therefore
// renders the row `resolved` with a `✓ smith's tools` header while NO chip
// carries the check · the picker looks empty. For count 1 a click self-heals but
// silently CHANGES the pick; for count > 1 the stale value occupies a slot with
// no chip that can toggle it off, which is hard stuck. Canonicalizing in
// buildItem (not in the strip) gives the chips, `selectedSummary` and the write
// path ONE canon, so the next write migrates the file.
describe("buildDecisionLedger · selected canonicalization", () => {
  /** Fighter carrying a 2014-Dwarf-shaped race trait: a select-proficiency
   *  `id: "tool"` plus the persisted origin pick, mirroring the live vault note
   *  (Volker.md persists `race:tool`). A race trait lands in `ledger.origin`. */
  function dwarfWithToolTrait(choice: Record<string, unknown>, persisted: unknown): ResolvedCharacter {
    const c = resolvedFighter(1);
    (c as { race: unknown }).race = {
      slug: "srd-2014_dwarf", name: "Dwarf", choices: [],
      traits: [{ name: "Tool Proficiency", choices: [choice] }],
    };
    (c.definition as { origin_choices: Record<string, unknown> }).origin_choices = { "race:tool": persisted };
    return c;
  }

  it("canonicalizes DecisionItem.selected onto the pool spelling so the builder chip matches", () => {
    const c = dwarfWithToolTrait(
      { kind: "select-proficiency", id: "tool", count: 1, domain: "tool",
        from: ["smith's-tools", "brewer's-supplies", "mason's-tools"] },
      "smith's tools",
    );
    const ledger = buildDecisionLedger(c, { registry } as never);
    const item = findItem(ledger, "origin", "tool");   // ledger.origin, NOT ledger.classes
    expect(item.selected).toBe("smith's-tools");
    expect(item.status).toBe("resolved");
    // The chip the strip highlights must EXIST in the option pool, or the row
    // reads resolved above an apparently empty picker.
    expect(item.options.some((o) => o.value === item.selected)).toBe(true);
  });

  it("leaves a pick absent from the pool VERBATIM, keeping the row resolved", () => {
    // Live-reachable, not hypothetical: a `domain: "tool"` choice with no `from`
    // enumerates the 35-slug ALL_TOOLS vocabulary, so any homebrew or legacy tool
    // value outside it takes the no-match path. DROPPING it here would flip the
    // row to `unresolved` and erase the pick from selectedSummary · exactly the
    // data loss this canonicalization exists to prevent, inside the fix for it.
    const c = dwarfWithToolTrait(
      { kind: "select-proficiency", id: "tool", count: 1, domain: "tool" },
      "grandpa's whittling knife",
    );
    const ledger = buildDecisionLedger(c, { registry } as never);
    const item = findItem(ledger, "origin", "tool");
    expect(item.options).toHaveLength(35);
    expect(item.selected).toBe("grandpa's whittling knife");   // verbatim: spaces and all
    expect(item.status).toBe("resolved");
  });

  it("canonicalizes every entry of the string[] shape, preserving order and unknowns", () => {
    const c = dwarfWithToolTrait(
      { kind: "select-proficiency", id: "tool", count: 2, domain: "tool" },
      ["Thieves’ Tools", "grandpa's whittling knife"],   // U+2019 + casing, then an unknown
    );
    const ledger = buildDecisionLedger(c, { registry } as never);
    const item = findItem(ledger, "origin", "tool");
    expect(item.selected).toEqual(["thieves'-tools", "grandpa's whittling knife"]);
    expect(item.status).toBe("resolved");               // 2 of 2, the unknown still counts
  });

  it("leaves every other choice kind untouched, canonicalizing ONLY select-proficiency", () => {
    // A select-entity persists an ENTITY REF, not a proficiency slug: folding it
    // would silently rewrite the ref (here "Archery" would become the pool's
    // "archery" and appear to match). ability-points persists a record, which the
    // string/array guards must pass through by identity.
    const c = resolvedFighter(4, {
      1: { "fighting-style": "Archery" },
      4: { feat: "[[srd-2024_ability-score-improvement]]", "feat:asi": { str: 2 } },
    });
    const ledger = buildDecisionLedger(c, { registry: featRegistry } as never);
    expect(findItem(ledger, "classes", "fighting-style").selected).toBe("Archery");
    const asi = findItem(ledger, "classes", "feat").children?.find((k) => k.key === "feat:asi");
    expect(asi?.selected).toEqual({ str: 2 });
  });
});

// ── chosen-feat children (SP2 Plan 5: surface a chosen feat's own decisions) ──
//
// When the flattened L4 feat pick resolves to a concrete feat, that feat's own
// `choices` (e.g. Ability Score Improvement's ability-points pick, Magic
// Initiate's two select-inline picks) must surface as ledger children under the
// feat select-entity, namespaced `feat:<choiceId>` so they never collide with
// the legacy asi-branch's literal `asi` key.
describe("buildDecisionLedger — chosen-feat children", () => {
  // The flattened L4 feat item. Since R4-P4 it is a TOP-LEVEL item keyed `feat`,
  // no longer a child of an `asi-or-feat` select-inline.
  const featBranchChild = (
    choices: Record<number, Record<string, unknown>>,
  ) => {
    const ledger = buildDecisionLedger(resolvedFighter(4, choices), { registry: featRegistry } as never);
    return ledger.classes[0].levels.flatMap((l) => l.items).find((i) => i.key === "feat");
  };

  it("surfaces ONE ability-points child (key feat:asi) for a chosen ASI feat", () => {
    const featItem = featBranchChild({
      4: { feat: "[[srd-2024_ability-score-improvement]]" },
    })!;
    expect(featItem.children).toHaveLength(1);
    const child = featItem.children![0];
    expect(child.key).toBe("feat:asi");
    expect(child.choice.kind).toBe("ability-points");
    expect((child.choice as { points: number }).points).toBe(2);
    expect((child.choice as { max_per: number }).max_per).toBe(2);
  });

  it("downgrades the feat item to partial when the feat child is unresolved", () => {
    const featItem = featBranchChild({
      4: { feat: "[[srd-2024_ability-score-improvement]]" },
    })!;
    // feat:asi has no allocation yet → child unresolved → feat item partial.
    expect(featItem.children![0].status).toBe("unresolved");
    expect(featItem.status).toBe("partial");
  });

  it("resolves the feat item once the namespaced feat:asi allocation is full", () => {
    const featItem = featBranchChild({
      4: { feat: "[[srd-2024_ability-score-improvement]]", "feat:asi": { str: 2 } },
    })!;
    expect(featItem.children![0].status).toBe("resolved");
    expect(featItem.status).toBe("resolved");
  });

  it("surfaces Magic Initiate's two select-inline children, namespaced feat:*", () => {
    const featItem = featBranchChild({
      4: { feat: "[[srd-2024_magic-initiate]]" },
    })!;
    expect(featItem.children).toHaveLength(2);
    expect(featItem.children!.map((c) => c.key)).toEqual(["feat:spell-list", "feat:spellcasting-ability"]);
    expect(featItem.children!.every((c) => c.choice.kind === "select-inline")).toBe(true);
  });

  it("does not collide the chosen-feat asi child with the legacy asi-branch key", () => {
    // Same level carries BOTH a stale asi-branch allocation AND a feat pick with
    // its own feat:asi allocation; they must read independently. The stale `asi`
    // key is exactly what a vault record persisted BEFORE the flatten holds.
    // Scope note (R4-P4 Decision B): the LEDGER still reads the two keys
    // independently, exactly as asserted below · that is what this test pins.
    // RECALC no longer does: collectClassAsiBranch (pc.recalc.ts) now DISCARDS an
    // `asi` sharing a level with a string `feat` key as branch-switch residue, so
    // this same fixture contributes only the feat:asi points to ability scores.
    const featItem = featBranchChild({
      4: { asi: { dex: 2 },
        feat: "[[srd-2024_ability-score-improvement]]", "feat:asi": { str: 1, con: 1 } },
    })!;
    const child = featItem.children![0];
    expect(child.selected).toEqual({ str: 1, con: 1 }); // reads feat:asi, NOT the asi-branch dex
  });

  it("adds no children for an unresolvable feat slug, and does not crash", () => {
    const featItem = featBranchChild({
      4: { feat: "[[srd-2024_does-not-exist]]" },
    })!;
    expect(featItem.children).toBeUndefined();
  });

  it("adds no children for a feat whose choices are empty", () => {
    const featItem = featBranchChild({
      4: { feat: "[[srd-2024_alert]]" },
    })!;
    expect(featItem.children).toBeUndefined();
  });

  it("grows NO children for a subclass select-entity pick", () => {
    // A class feature whose decision is a subclass select-entity must never gain
    // children even though it is a select-entity — feat scope is exclusive.
    const subFeature = {
      id: "subclass-feature", name: "Martial Archetype", description: "Choose a subclass.",
      choices: [{ kind: "select-entity", id: "subclass", count: 1, entity_type: "subclass" }],
    };
    const c = resolvedFighter(4, { 4: {} });
    (c.classes[0].entity as { features_by_level: Record<number, unknown[]> }).features_by_level[3] = [subFeature];
    c.features.push({ feature: subFeature, source: { kind: "class", slug: "srd-2024_fighter", level: 3 } } as never);
    const ledger = buildDecisionLedger(c, { registry: featRegistry } as never);
    const sub = ledger.classes[0].levels.flatMap((l) => l.items).find((i) => i.key === "subclass")!;
    expect(sub.children).toBeUndefined();
  });
});

// ── subclass-pick guarantee (Fix B) ──────────────────────────────────────────
//
// The owned ledger must always offer the subclass pick once subclass_level is
// reached — even for the one class (2024 Bard) whose runtime JSON lacks the
// authored select-entity. The synthesized item filters candidates by
// parent_class==="self" and writes through the SAME setSubclass path (key
// "subclass", choice.entity_type "subclass") as the authored item.
describe("buildDecisionLedger — subclass-pick guarantee", () => {
  // Two Bard subclasses (parent_class → Bard) and one Fighter subclass (must be
  // excluded by the parent_class==="self" filter).
  const subclasses: RegisteredEntity[] = [
    { slug: "srd-2024_college-of-lore", name: "College of Lore", entityType: "subclass", filePath: "lore.md",
      data: { parent_class: "[[SRD 2024/Classes/Bard]]", features_by_level: {} },
      compendium: "SRD 2024", readonly: true, homebrew: false },
    { slug: "srd-2024_college-of-valor", name: "College of Valor", entityType: "subclass", filePath: "valor.md",
      data: { parent_class: "[[SRD 2024/Classes/Bard]]", features_by_level: {} },
      compendium: "SRD 2024", readonly: true, homebrew: false },
    { slug: "srd-2024_champion", name: "Champion", entityType: "subclass", filePath: "champ.md",
      data: { parent_class: "[[SRD 2024/Classes/Fighter]]", features_by_level: {} },
      compendium: "SRD 2024", readonly: true, homebrew: false },
  ];
  const subRegistry = {
    search: (_q: string, type: string) => subclasses.filter((s) => s.entityType === type),
    getByTypeAndSlug: (type: string, slug: string) =>
      subclasses.find((s) => s.entityType === type && s.slug === slug),
  };

  /** Bard-shaped resolved character: subclass_level 3, subclass_feature_name set,
   *  NO authored subclass select-entity anywhere (the 2024 Bard gap). The L3
   *  "Bard Subclass" feature is a plain feature (no choices). */
  function resolvedBard(level: number, subclass: { slug: string } | null = null): ResolvedCharacter {
    const subFeature = { id: "bard-subclass", name: "Bard Subclass", description: "You gain a Bard subclass." };
    const entity = {
      slug: "srd-2024_bard", name: "Bard",
      skill_choices: { count: 3, from: ["arcana", "deception"] },
      subclass_level: 3, subclass_feature_name: "Bard Subclass",
      features_by_level: { 1: [], 3: [subFeature] }, starting_equipment: [],
    };
    const definition = {
      name: "T", edition: "2024", race: null, subrace: null, background: null,
      class: [{ name: "[[bard]]", level, subclass: subclass ? `[[${subclass.slug}]]` : null, choices: {} }],
      abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      ability_method: "manual", skills: { proficient: [], expertise: [] },
      spells: { known: [], overrides: [] }, equipment: [], overrides: {}, origin_choices: {},
      state: { hp: { current: 1, max: 1, temp: 0 }, hit_dice: {}, spell_slots: {}, concentration: null,
        conditions: [], exhaustion: 0, inspiration: 0, feature_uses: {} },
    } as unknown as ResolvedCharacter["definition"];
    const cls = { entity, level, subclass, choices: {} } as unknown as ResolvedCharacter["classes"][number];
    const features = level >= 3
      ? [{ feature: subFeature, source: { kind: "class", slug: entity.slug, level: 3 } }]
      : [];
    return { definition, race: null, classes: [cls], background: null, feats: [],
      totalLevel: level, features, spells: [], pools: [], state: definition.state } as unknown as ResolvedCharacter;
  }

  it("synthesizes a subclass pick at subclass_level, filtered by parent_class, unresolved when unset", () => {
    const ledger = buildDecisionLedger(resolvedBard(3), { registry: subRegistry } as never);
    const items = ledger.classes[0].levels.flatMap((l) => l.items);
    const sub = items.find((i) => i.key === "subclass")!;
    expect(sub).toBeDefined();
    expect(sub.level).toBe(3);
    expect(sub.status).toBe("unresolved");
    expect(sub.choice.kind).toBe("select-entity");
    expect((sub.choice as { entity_type: string }).entity_type).toBe("subclass");
    // Only the two Bard subclasses — the Fighter Champion is filtered out.
    expect(sub.options.map((o) => o.value).sort())
      .toEqual(["srd-2024_college-of-lore", "srd-2024_college-of-valor"]);
  });

  it("marks the synthesized pick resolved when ClassEntry.subclass is set", () => {
    const ledger = buildDecisionLedger(
      resolvedBard(5, { slug: "srd-2024_college-of-lore" }), { registry: subRegistry } as never);
    const sub = ledger.classes[0].levels.flatMap((l) => l.items).find((i) => i.key === "subclass")!;
    expect(sub.status).toBe("resolved");
    expect(sub.selected).toBe("srd-2024_college-of-lore");
  });

  it("does NOT synthesize before subclass_level (class level 2 < 3)", () => {
    const ledger = buildDecisionLedger(resolvedBard(2), { registry: subRegistry } as never);
    const sub = ledger.classes[0].levels.flatMap((l) => l.items).find((i) => i.key === "subclass");
    expect(sub).toBeUndefined();
  });

  it("emits exactly ONE subclass row when the class authors its own select-entity (no duplicate)", () => {
    // Cleric-shaped: the L3 feature carries the authored subclass select-entity,
    // so the guarantee must NOT add a second row (mirrors the browse-walker
    // 'Cleric Subclass' vs 'Cleric Subclasses' dedupe regression case).
    const authoredFeature = {
      id: "divine-domain", name: "Divine Domain", description: "Choose a domain.",
      choices: [{ kind: "select-entity", id: "subclass", count: 1, entity_type: "subclass",
        where: { parent_class: "self" } }],
    };
    const entity = {
      slug: "srd-2024_cleric", name: "Cleric",
      skill_choices: { count: 2, from: ["history", "religion"] },
      subclass_level: 3, subclass_feature_name: "Cleric Subclass",
      features_by_level: { 3: [authoredFeature] }, starting_equipment: [],
    };
    const definition = {
      name: "T", edition: "2024", race: null, subrace: null, background: null,
      class: [{ name: "[[cleric]]", level: 3, subclass: null, choices: {} }],
      abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      ability_method: "manual", skills: { proficient: [], expertise: [] },
      spells: { known: [], overrides: [] }, equipment: [], overrides: {}, origin_choices: {},
      state: { hp: { current: 1, max: 1, temp: 0 }, hit_dice: {}, spell_slots: {}, concentration: null,
        conditions: [], exhaustion: 0, inspiration: 0, feature_uses: {} },
    } as unknown as ResolvedCharacter["definition"];
    const cls = { entity, level: 3, subclass: null, choices: {} } as unknown as ResolvedCharacter["classes"][number];
    const features = [{ feature: authoredFeature, source: { kind: "class", slug: entity.slug, level: 3 } }];
    const resolved = { definition, race: null, classes: [cls], background: null, feats: [],
      totalLevel: 3, features, spells: [], pools: [], state: definition.state } as unknown as ResolvedCharacter;
    // A cleric subclass so the authored where-filter has a candidate.
    const clericSub: RegisteredEntity = { slug: "srd-2024_life-domain", name: "Life Domain",
      entityType: "subclass", filePath: "life.md",
      data: { parent_class: "[[SRD 2024/Classes/Cleric]]", features_by_level: {} },
      compendium: "SRD 2024", readonly: true, homebrew: false };
    const reg = {
      search: (_q: string, type: string) => (type === "subclass" ? [clericSub] : []),
      getByTypeAndSlug: (type: string, slug: string) =>
        type === "subclass" && slug === clericSub.slug ? clericSub : undefined,
    };
    const ledger = buildDecisionLedger(resolved, { registry: reg } as never);
    const subs = ledger.classes[0].levels.flatMap((l) => l.items).filter((i) => i.key === "subclass");
    expect(subs).toHaveLength(1);
    expect(subs[0].featureName).toBe("Divine Domain"); // the authored row, not a synthesized "Cleric Subclass"
  });
});

// ── Task B2: matchesFilter weapon/armor category ─────────────────────────────
// Real entity field names (confirmed in weapon.types.ts / armor.types.ts): BOTH
// weapons and armor store their class in a `category` field. Weapons use
// compound lowercase values (e.g. "martial-melee", "simple-ranged"); armor uses
// plain lowercase values ("light"|"medium"|"heavy"|"shield"). The filter VALUE
// is plain ("simple"|"martial" / "light"|... ); the engine prefix-matches the
// weapon category and exact-matches the armor category.
describe("matchesFilter weapon/armor category", () => {
  const ent = (data: object): RegisteredEntity =>
    ({ slug: "x", name: "X", entityType: "weapon", filePath: "x.md", data,
       compendium: "SRD 2024", readonly: true, homebrew: false } as RegisteredEntity);
  it("matches martial weapons", () => {
    // martial-* matches "martial"; simple-* does not.
    expect(__matchesFilterForTest(ent({ category: "martial-melee" }), { weapon_category: "martial" }, "fighter")).toBe(true);
    expect(__matchesFilterForTest(ent({ category: "martial-ranged" }), { weapon_category: "martial" }, "fighter")).toBe(true);
    expect(__matchesFilterForTest(ent({ category: "simple-melee" }), { weapon_category: "martial" }, "fighter")).toBe(false);
    expect(__matchesFilterForTest(ent({ category: "simple-melee" }), { weapon_category: "simple" }, "fighter")).toBe(true);
    expect(__matchesFilterForTest(ent({ category: "natural" }), { weapon_category: "martial" }, "fighter")).toBe(false);
  });
  it("matches armor by category and shields", () => {
    expect(__matchesFilterForTest(ent({ category: "heavy" }), { armor_category: "heavy" }, "x")).toBe(true);
    expect(__matchesFilterForTest(ent({ category: "shield" }), { armor_category: "shield" }, "x")).toBe(true);
    expect(__matchesFilterForTest(ent({ category: "light" }), { armor_category: "heavy" }, "x")).toBe(false);
  });
});

// ── Task B3: structured equipment synthesis + nested category picks ──────────
// The equipment block reads the STRUCTURED shape: each EquipmentOption.label
// drives the select-inline row, and a `{ category }` grant on an option becomes
// a nested select-entity child revealed (buildItem's select-inline child rule)
// when that option is selected. Weapons → entity_type "weapon" + weapon_category;
// armor → entity_type "armor" + armor_category; "shield" → armor shield.
describe("equipment synthesis (structured)", () => {
  it("synthesizes a select-inline with a nested category child on the chosen option", () => {
    // option-0 is selected so its nested category grant reveals as a child.
    const c = resolvedFighter(1, { 1: { "equipment-0": "option-0" } });
    (c.classes[0].entity as { starting_equipment: unknown[] }).starting_equipment = [
      { kind: "choice", options: [
        { label: "A martial weapon + shield", grants: [{ category: "martial-weapon" }, { item: "shield" }] },
        { label: "155 GP", grants: [{ gold: 155 }] },
      ] },
    ];
    const ledger = buildDecisionLedger(c, { registry } as never);
    const item = ledger.classes[0].levels.flatMap((l) => l.items).find((i) => i.key === "equipment-0")!;
    expect(item.choice.kind).toBe("select-inline");
    expect(item.options.map((o) => o.label)).toEqual(["A martial weapon + shield", "155 GP"]);
    // The chosen option (option-0) reveals exactly one nested category child;
    // the `{ item }` grant is NOT a decision, only `{ category }` is.
    expect(item.children).toHaveLength(1);
    const child = item.children![0];
    expect(child.choice.kind).toBe("select-entity");
    expect((child.choice as { entity_type: string }).entity_type).toBe("weapon");
    expect((child.choice as { where?: { weapon_category?: string } }).where?.weapon_category).toBe("martial");
  });

  it("reveals no children when the option carries no category grant (gold only)", () => {
    const c = resolvedFighter(1, { 1: { "equipment-0": "option-1" } });
    (c.classes[0].entity as { starting_equipment: unknown[] }).starting_equipment = [
      { kind: "choice", options: [
        { label: "A martial weapon + shield", grants: [{ category: "martial-weapon" }, { item: "shield" }] },
        { label: "155 GP", grants: [{ gold: 155 }] },
      ] },
    ];
    const ledger = buildDecisionLedger(c, { registry } as never);
    const item = ledger.classes[0].levels.flatMap((l) => l.items).find((i) => i.key === "equipment-0")!;
    expect(item.children ?? []).toHaveLength(0);
  });

  it("resolves an `any-armor` grant to an armor select-entity with NO armor_category restriction", () => {
    // "any-armor" is a named vocabulary term: the child must match ALL armor,
    // not heavy-only. The fix omits `where` so enumerateOptions returns all of
    // entity_type "armor" (an absent filter = all-of-type).
    const c = resolvedFighter(1, { 1: { "equipment-0": "option-0" } });
    (c.classes[0].entity as { starting_equipment: unknown[] }).starting_equipment = [
      { kind: "choice", options: [
        { label: "Any armor", grants: [{ category: "any-armor" }] },
        { label: "155 GP", grants: [{ gold: 155 }] },
      ] },
    ];
    const ledger = buildDecisionLedger(c, { registry } as never);
    const item = ledger.classes[0].levels.flatMap((l) => l.items).find((i) => i.key === "equipment-0")!;
    expect(item.children).toHaveLength(1);
    const child = item.children![0];
    expect(child.choice.kind).toBe("select-entity");
    expect((child.choice as { entity_type: string }).entity_type).toBe("armor");
    // No class restriction — the player can pick any armor, not heavy-only.
    expect((child.choice as { where?: { armor_category?: string } }).where?.armor_category).toBeUndefined();
  });
});

// ── robustness: old-shape / malformed starting equipment must not crash ──────
// OLD-shape (option is a plain string) or malformed (an option lacks an array
// `grants`) starting_equipment must degrade gracefully: the engine synthesizes a
// valid select-inline with no nested children, never throws, and warns once per
// degraded class so the regression is surfaced (deduped, not silent).
describe("equipment synthesis robustness (old-shape / malformed)", () => {
  it("does NOT throw when a class option is an old-shape string, and warns once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const c = resolvedFighter(1);
      (c.classes[0].entity as { starting_equipment: unknown[] }).starting_equipment = [
        { kind: "choice", options: ["(a) chain mail", "(b) 75 GP"] },
      ];
      let ledger!: ReturnType<typeof buildDecisionLedger>;
      expect(() => { ledger = buildDecisionLedger(c, { registry } as never); }).not.toThrow();
      // The equipment item still synthesizes as a select-inline with both labels
      // and NO nested children (a degraded option seeds nothing).
      const item = ledger.classes[0].levels.flatMap((l) => l.items).find((i) => i.key === "equipment-0")!;
      expect(item.choice.kind).toBe("select-inline");
      expect(item.options.map((o) => o.label)).toEqual(["(a) chain mail", "(b) 75 GP"]);
      expect(item.children ?? []).toHaveLength(0);
      // Surfaced once for this class slug (deduped).
      const hits = warn.mock.calls.filter(([m]) => typeof m === "string" && m.includes("srd-2024_fighter"));
      expect(hits.length).toBe(1);
    } finally {
      warn.mockRestore();
    }
  });

  it("does NOT throw when an option object lacks a grants array (malformed)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const c = resolvedFighter(1, { 1: { "equipment-0": "option-0" } });
      (c.classes[0].entity as { starting_equipment: unknown[] }).starting_equipment = [
        { kind: "choice", options: [{ label: "Chain Mail" }, { label: "75 GP", grants: [{ gold: 75 }] }] },
      ];
      let ledger!: ReturnType<typeof buildDecisionLedger>;
      expect(() => { ledger = buildDecisionLedger(c, { registry } as never); }).not.toThrow();
      const item = ledger.classes[0].levels.flatMap((l) => l.items).find((i) => i.key === "equipment-0")!;
      expect(item.choice.kind).toBe("select-inline");
      expect(item.options.map((o) => o.label)).toEqual(["Chain Mail", "75 GP"]);
      expect(item.children ?? []).toHaveLength(0);
    } finally {
      warn.mockRestore();
    }
  });

  it("does NOT warn for GOOD new-shape structured equipment", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const c = resolvedFighter(1, { 1: { "equipment-0": "option-0" } });
      (c.classes[0].entity as { starting_equipment: unknown[] }).starting_equipment = [
        { kind: "choice", options: [
          { label: "A martial weapon + shield", grants: [{ category: "martial-weapon" }, { item: "shield" }] },
          { label: "155 GP", grants: [{ gold: 155 }] },
        ] },
      ];
      const ledger = buildDecisionLedger(c, { registry } as never);
      const item = ledger.classes[0].levels.flatMap((l) => l.items).find((i) => i.key === "equipment-0")!;
      // Good data still synthesizes its nested category child — unchanged behavior.
      expect(item.children).toHaveLength(1);
      const hits = warn.mock.calls.filter(([m]) => typeof m === "string" && m.includes("srd-2024_fighter"));
      expect(hits.length).toBe(0);
    } finally {
      warn.mockRestore();
    }
  });
});

// ── Task 3c: spell axis (list / level / edition) on EntityFilter ──────────────
// Feats like Magic Initiate grant spells the player picks from a class spell
// list at a fixed level and edition. A select-entity{entity_type:"spell",
// where:{list,level,edition}} choice must filter the registry's spells by:
//   · list    → matched against a spell entity's `classes[]`
//   · level   → exact spell level (absent level = cantrip, treated as 0)
//   · edition → "2014" | "2024", so a spell that exists in both editions is
//               offered ONCE (dedupe by edition, e.g. Sacred Flame).
// Verified spell shape (spell.types.ts): classes?: string[], level?: number
// (cantrips 0 or absent), edition?: "2014" | "2024" | string.

const spellEnt = (slug: string, name: string, data: object): RegisteredEntity =>
  ({ slug, name, entityType: "spell", filePath: `${slug}.md`, data,
     compendium: "SRD", readonly: true, homebrew: false } as RegisteredEntity);

// A mixed spell pool: 2024 cleric cantrip, a level-absent 2024 cleric cantrip
// (proves absent level = 0), a 2024 cleric L1 spell, a 2024 wizard cantrip, and
// the 2014-edition Sacred Flame duplicate (proves the edition dedupe).
const spells: RegisteredEntity[] = [
  spellEnt("srd-2024_sacred-flame", "Sacred Flame", { classes: ["cleric"], level: 0, edition: "2024" }),
  spellEnt("srd-2024_word-of-radiance", "Word of Radiance", { classes: ["cleric"], edition: "2024" }),
  spellEnt("srd-2024_bless", "Bless", { classes: ["cleric"], level: 1, edition: "2024" }),
  spellEnt("srd-2024_fire-bolt", "Fire Bolt", { classes: ["wizard"], level: 0, edition: "2024" }),
  spellEnt("srd-2014_sacred-flame", "Sacred Flame", { classes: ["cleric"], level: 0, edition: "2014" }),
];
const spellRegistry = {
  search: (_q: string, type: string) => spells.filter((s) => s.entityType === type),
  getByTypeAndSlug: (type: string, slug: string) =>
    spells.find((s) => s.entityType === type && s.slug === slug),
};

describe("matchesFilter spell axis (list/level/edition)", () => {
  const s = (data: object): RegisteredEntity => spellEnt("x", "X", data);

  it("filters by class list against a spell's classes[]", () => {
    expect(__matchesFilterForTest(s({ classes: ["cleric"], level: 0 }), { list: "cleric" }, "")).toBe(true);
    expect(__matchesFilterForTest(s({ classes: ["wizard", "sorcerer"], level: 0 }), { list: "cleric" }, "")).toBe(false);
    // A spell with no classes[] can never match a list filter.
    expect(__matchesFilterForTest(s({ level: 0 }), { list: "cleric" }, "")).toBe(false);
  });

  it("filters by exact level, treating an absent level as a cantrip (0)", () => {
    expect(__matchesFilterForTest(s({ classes: ["cleric"], level: 1 }), { level: 1 }, "")).toBe(true);
    expect(__matchesFilterForTest(s({ classes: ["cleric"], level: 0 }), { level: 1 }, "")).toBe(false);
    // Absent level defaults to 0 (cantrip), so it matches level: 0 and not level: 1.
    expect(__matchesFilterForTest(s({ classes: ["cleric"] }), { level: 0 }, "")).toBe(true);
    expect(__matchesFilterForTest(s({ classes: ["cleric"] }), { level: 1 }, "")).toBe(false);
  });

  it("filters by edition, deduping a cross-edition duplicate", () => {
    expect(__matchesFilterForTest(s({ classes: ["cleric"], level: 0, edition: "2024" }), { edition: "2024" }, "")).toBe(true);
    expect(__matchesFilterForTest(s({ classes: ["cleric"], level: 0, edition: "2014" }), { edition: "2024" }, "")).toBe(false);
  });

  it("combines list AND level AND edition", () => {
    const where = { list: "cleric", level: 0, edition: "2024" };
    expect(__matchesFilterForTest(s({ classes: ["cleric"], level: 0, edition: "2024" }), where, "")).toBe(true);
    expect(__matchesFilterForTest(s({ classes: ["cleric"], level: 1, edition: "2024" }), where, "")).toBe(false); // level
    expect(__matchesFilterForTest(s({ classes: ["wizard"], level: 0, edition: "2024" }), where, "")).toBe(false); // list
    expect(__matchesFilterForTest(s({ classes: ["cleric"], level: 0, edition: "2014" }), where, "")).toBe(false); // edition
  });
});

describe("buildDecisionLedger — spell enumeration (Magic Initiate axis)", () => {
  /** A class feature carrying a spell select-entity with the spell axis where. */
  function resolvedSpellPicker(where: object): ResolvedCharacter {
    const feature = {
      id: "magic-initiate-cleric", name: "Magic Initiate (Cleric)", description: "Pick two cleric cantrips.",
      choices: [{ kind: "select-entity", id: "mi-cantrips", count: 2, entity_type: "spell", where }],
    };
    const entity = { slug: "srd-2024_cleric", name: "Cleric",
      skill_choices: { count: 0, from: [] },
      features_by_level: { 1: [feature] }, starting_equipment: [] };
    const definition = {
      name: "T", edition: "2024", race: null, subrace: null, background: null,
      class: [{ name: "[[cleric]]", level: 1, subclass: null, choices: {} }],
      abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      ability_method: "manual", skills: { proficient: [], expertise: [] },
      spells: { known: [], overrides: [] }, equipment: [], overrides: {}, origin_choices: {},
      state: { hp: { current: 1, max: 1, temp: 0 }, hit_dice: {}, spell_slots: {}, concentration: null,
        conditions: [], exhaustion: 0, inspiration: 0, feature_uses: {} },
    } as unknown as ResolvedCharacter["definition"];
    const cls = { entity, level: 1, subclass: null, choices: {} } as unknown as ResolvedCharacter["classes"][number];
    const features = [{ feature, source: { kind: "class", slug: entity.slug, level: 1 } }];
    return { definition, race: null, classes: [cls], background: null, feats: [],
      totalLevel: 1, features, spells: [], pools: [], state: definition.state } as unknown as ResolvedCharacter;
  }

  it("enumerates only 2024 cleric cantrips (no L1, no wizard, no 2014 duplicate)", () => {
    const ledger = buildDecisionLedger(
      resolvedSpellPicker({ list: "cleric", level: 0, edition: "2024" }),
      { registry: spellRegistry } as never);
    const item = ledger.classes[0].levels.flatMap((l) => l.items).find((i) => i.key === "mi-cantrips")!;
    const slugs = item.options.map((o) => o.value).sort();
    // Both 2024 cleric cantrips (the level-absent one included via `?? 0`).
    expect(slugs).toEqual(["srd-2024_sacred-flame", "srd-2024_word-of-radiance"]);
    expect(slugs).not.toContain("srd-2024_bless");         // L1 excluded by level
    expect(slugs).not.toContain("srd-2024_fire-bolt");     // wizard excluded by list
    expect(slugs).not.toContain("srd-2014_sacred-flame");  // 2014 duplicate excluded by edition
  });

  it("enumerates only the 2024 cleric L1 spell for a level:1 pick", () => {
    const ledger = buildDecisionLedger(
      resolvedSpellPicker({ list: "cleric", level: 1, edition: "2024" }),
      { registry: spellRegistry } as never);
    const item = ledger.classes[0].levels.flatMap((l) => l.items).find((i) => i.key === "mi-cantrips")!;
    expect(item.options.map((o) => o.value)).toEqual(["srd-2024_bless"]);
  });
});

describe("choiceSchema — select-entity spell where axis (STRICT)", () => {
  it("ACCEPTS a select-entity spell choice carrying where:{list,level,edition}", () => {
    const input = {
      kind: "select-entity", id: "mi-cantrips", count: 2, entity_type: "spell",
      where: { list: "cleric", level: 0, edition: "2024" },
    };
    const parsed = choiceSchema.parse(input) as { where?: object };
    expect(parsed.where).toEqual({ list: "cleric", level: 0, edition: "2024" });
  });

  it("still REJECTS an unknown where key (strict is preserved)", () => {
    const input = {
      kind: "select-entity", id: "x", entity_type: "spell",
      where: { list: "cleric", bogus: true },
    };
    expect(() => choiceSchema.parse(input)).toThrow();
  });
});
