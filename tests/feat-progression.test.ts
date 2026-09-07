import { describe, it, expect, beforeEach, vi } from "vitest";
import { buildDecisionLedger } from "../src/pc/pc.decision-engine";
import type { DecisionItem } from "../src/pc/pc.decision-engine";
import { __resetWarnOnceForTests } from "../src/dnd/warn-once";
import type { ResolvedCharacter } from "../src/pc/pc.types";
import type { ProgressionEntry } from "../src/schemas/entity-extras-schema";
import type { RegisteredEntity } from "@archivist-gg/core";

/** Feats keyed by the `category` the reader's `where` filters on: `matchesFilter` compares an entity's
 *  `data.category` to `where.category`. Three fighting-style feats and one epic-boon feat is enough to tell the
 *  two `where`s apart. */
const feat = (slug: string, name: string, category: string): RegisteredEntity => ({
  slug, name, entityType: "feat", filePath: `${slug}.md`,
  data: { slug, name, category, choices: [] }, compendium: "PHB 2024", readonly: true, homebrew: false,
});
const ENTITIES: RegisteredEntity[] = [
  feat("xphb_feat_archery", "Archery", "fighting-style"),
  feat("xphb_feat_defense", "Defense", "fighting-style"),
  feat("xphb_feat_duelling", "Duelling", "fighting-style"),
  feat("xphb_feat_boon-of-combat-prowess", "Boon of Combat Prowess", "epic-boon"),
  // the wrong-edition optional feature the recognizer's synthetic used to offer (spec §3.1's DEAD pick)
  { slug: "phb_optional-feature_archery", name: "Archery", entityType: "optional-feature", filePath: "ofa.md",
    data: { feature_type: "fighting_style", available_to: ["[[fighter]]"] },
    compendium: "PHB 2014", readonly: true, homebrew: false },
];
const ctx = { registry: {
  search: (_q: string, type: string) => ENTITIES.filter((e) => e.entityType === type),
  getByTypeAndSlug: (type: string, slug: string) => ENTITIES.find((e) => e.entityType === type && e.slug === slug),
} } as never;

/** A PHB-2024-Fighter-shaped resolved character. `feat_progression` rows are the RAW converter shape and each
 *  carries the REQUIRED `name` (`progressionSchema` declares `name: z.string().min(1)`), which is what makes the
 *  pushed decision's `label` and `featureName` never undefined. */
function fighter2024(opts: {
  level: number;
  featProgression?: ProgressionEntry[];
  subclassFeatProgression?: ProgressionEntry[];
  features?: Array<{ id: string; name: string; description: string; level: number }>;
}): ResolvedCharacter {
  const entity = {
    slug: "xphb_class_fighter", name: "Fighter", starting_equipment: [],
    ...(opts.featProgression ? { feat_progression: opts.featProgression } : {}),
  };
  const subclass = opts.subclassFeatProgression
    ? { slug: "xphb_subclass_champion", name: "Champion", feat_progression: opts.subclassFeatProgression }
    : null;
  const state = { hp: { current: 1, max: 1, temp: 0 }, hit_dice: {}, spell_slots: {}, concentration: null,
    conditions: [], exhaustion: 0, inspiration: 0, feature_uses: {} };
  const definition = {
    name: "T", edition: "2024", race: null, subrace: null, background: null,
    class: [{ name: "[[fighter]]", level: opts.level, subclass: subclass?.slug ?? null, choices: {} }],
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    ability_method: "manual", skills: { proficient: [], expertise: [] },
    spells: { known: [], overrides: [] }, equipment: [], overrides: {}, origin_choices: {}, state,
  } as unknown as ResolvedCharacter["definition"];
  const cls = { entity, level: opts.level, subclass, choices: {} } as unknown as ResolvedCharacter["classes"][number];
  const features = (opts.features ?? []).map((f) => ({
    feature: f, source: { kind: "class", slug: entity.slug, level: f.level },
  }));
  return { definition, race: null, classes: [cls], background: null, feats: [],
    totalLevel: opts.level, features, spells: [], pools: [], state } as unknown as ResolvedCharacter;
}

const allItems = (r: ResolvedCharacter): DecisionItem[] =>
  buildDecisionLedger(r, ctx).classes[0].levels.flatMap((l) => l.items);
const itemsAt = (r: ResolvedCharacter, lvl: number): DecisionItem[] =>
  buildDecisionLedger(r, ctx).classes[0].levels.find((l) => l.level === lvl)?.items ?? [];
const whereCategory = (i: DecisionItem) => (i.choice as { where?: { category?: string } }).where?.category;

/** MODULE-scope spy plus a per-test `mockClear`, on `decision-bybare-determinism.test.ts`'s shipped idiom: a
 *  `let warnSpy: ReturnType<typeof vi.spyOn>` does NOT typecheck cleanly (`vi.spyOn` is generic over its
 *  target), and `warnOnce`'s `seen` Set is module-global, so the reset is needed per test either way. */
const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
beforeEach(() => { __resetWarnOnceForTests(); warnSpy.mockClear(); });

describe("the class-side feat_progression reader (R4-G5 §3.2.5)", () => {
  it("RED FIRST: a [\"FS\",\"FS:P\"] row at level 2 emits ONE feat pick filtered to fighting-style", () => {
    const r = fighter2024({ level: 2,
      featProgression: [{ name: "Fighting Style", category: ["FS", "FS:P"], progression: { "2": 1 } }] });
    const picks = itemsAt(r, 2).filter((i) => i.key === "feat");
    expect(picks.map((i) => `${i.featureName}/${whereCategory(i)}`)).toEqual(["Fighting Style/fighting-style"]);
    expect(picks[0].options.map((o) => o.value).sort())
      .toEqual(["xphb_feat_archery", "xphb_feat_defense", "xphb_feat_duelling"]);
    expect((picks[0].choice as { count?: number }).count).toBe(1);
    expect(picks[0].choice.id).toBe("feat");
  });

  it("RED FIRST: the FIRST mapped code wins the array reduction (§13 row 9)", () => {
    const r = fighter2024({ level: 1,
      featProgression: [{ name: "Fighting Style", category: ["FS", "D"], progression: { "1": 1 } }] });
    expect(itemsAt(r, 1).filter((i) => i.key === "feat").map(whereCategory)).toEqual(["fighting-style"]);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("an all-unmapped category row warns ONCE across two builds and emits nothing", () => {
    const r = fighter2024({ level: 1,
      featProgression: [{ name: "Dragonmark", category: ["D", "DG"], progression: { "1": 1 } }] });
    expect(itemsAt(r, 1).filter((i) => i.key === "feat")).toEqual([]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    buildDecisionLedger(r, ctx);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("RED FIRST: a level that ALREADY carries a feat decision gets no second one (§13 row 10)", () => {
    // The recognizer turns an "ability-score-improvement" feature into the flat `feat` pick, and the reader runs
    // AFTER the walk precisely so this guard can see it. Zero collisions exist on shipped data: this is a
    // construction (no carrier puts a feat_progression level on an ASI level).
    const r = fighter2024({ level: 4,
      featProgression: [{ name: "Epic Boon", category: ["EB"], progression: { "4": 1 } }],
      features: [{ id: "ability-score-improvement", name: "Ability Score Improvement",
        description: "You gain the Ability Score Improvement feat or another feat of your choice.", level: 4 }] });
    expect(itemsAt(r, 4).filter((i) => i.key === "feat").map((i) => i.featureName))
      .toEqual(["Ability Score Improvement"]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("RED FIRST: a feat_progression row on the SUBCLASS entity emits its own decision (§13 row 42)", () => {
    // The 2024 Champion is the ONE shipped subclass carrier: `{ name: "Fighting Style", category: ["FS"],
    // progression: { "7": 1 } }` on a Fighter 7.
    const r = fighter2024({ level: 7,
      subclassFeatProgression: [{ name: "Fighting Style", category: ["FS"], progression: { "7": 1 } }] });
    expect(itemsAt(r, 7).filter((i) => i.key === "feat").map((i) => `${i.featureName}/${whereCategory(i)}`))
      .toEqual(["Fighting Style/fighting-style"]);
  });

  it("a `*` progression key and the ARRAY arm emit nothing (fixture-only: the one shipped `*` row sits on an optional feature)", () => {
    const star = fighter2024({ level: 20,
      featProgression: [{ name: "Origin Feat", category: ["O"], progression: { "*": 1 } }] });
    expect(allItems(star).filter((i) => i.key === "feat")).toEqual([]);
    const arr = fighter2024({ level: 20,
      featProgression: [{ name: "Eldritch Invocation", category: ["EB"], progression: [0, 2] }] });
    expect(allItems(arr).filter((i) => i.key === "feat")).toEqual([]);
  });

  it("a level the character has NOT reached emits nothing (spec §3.2.5's `lvl <= c.level`)", () => {
    // SPEC, not a plan decision (Gate 2 ruled it: spec rev 10 §3.2.5 binds "each key of its `progression`
    // RECORD arm that parses as a level AT OR BELOW the class's current level"). The precedent it names is
    // the subclass-pick guarantee's own `subclassLevel <= c.level` in this same function. Without the gate a
    // level-19 Epic Boon row lands in a level-5 Fighter's ledger and the builder draws a level the character
    // has not reached.
    const low = fighter2024({ level: 5,
      featProgression: [{ name: "Epic Boon", category: ["EB"], progression: { "19": 1 } }] });
    expect(allItems(low).filter((i) => i.key === "feat")).toEqual([]);
    const high = fighter2024({ level: 19,
      featProgression: [{ name: "Epic Boon", category: ["EB"], progression: { "19": 1 } }] });
    expect(itemsAt(high, 19).filter((i) => i.key === "feat").map((i) => `${i.featureName}/${whereCategory(i)}`))
      .toEqual(["Epic Boon/epic-boon"]);
  });
});

describe("the shape-B suppression (R4-G5 §3.2.5)", () => {
  it("RED FIRST: a class carrying a fighting-style feat_progression is NOT also offered the recognizer's optional-feature synthetic (§13 row 40)", () => {
    const r = fighter2024({ level: 1,
      featProgression: [{ name: "Fighting Style", category: ["FS"], progression: { "1": 1 } }],
      features: [{ id: "fighting-style", name: "Fighting Style",
        description: "You gain a Fighting Style feat of your choice.", level: 1 }] });
    const items = itemsAt(r, 1);
    expect(items.filter((i) => (i.choice as { entity_type?: string }).entity_type === "optional-feature")
      .map((i) => i.choice.id)).toEqual([]);
    // and the level KEEPS one informational card for the feature, then gains the FEAT pick
    expect(items.map((i) => `${i.key}/${i.status}`)).toEqual(["fighting-style/informational", "feat/unresolved"]);
  });
});
