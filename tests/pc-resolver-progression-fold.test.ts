import { describe, it, expect } from "vitest";
import { collectResolvedFeatures } from "../src/pc/pc.resolver";
import { resolveFeatureResources } from "../src/pc/pc.resources";
import { computeFeatureEffects } from "../src/pc/pc.feature-effects";
import type { ResolvedClass, ResolvedFeature } from "../src/pc/pc.types";

// R4-G7 §7.1 (the user ruling R-G7-4): within ONE class list, and separately within ONE subclass list, the
// copies of a repeated `feature.id` collected at or below the character's level fold into ONE wrapper. The
// kept wrapper is the HIGHEST-level copy's identity and source; `effects` concatenate in ascending level
// order, `resources` keep the FIRST declaration of each resource id (the `resolveFeatureResources` rule) and
// `chosenInline` concatenates. Id-less features, ASI slots and the entity-level resources pseudo-feature
// never fold. The fixtures are the shapes MEASURED on the shipped corpora (spec §7.1).

const last = <T>(xs: T[]): T => xs[xs.length - 1];
const withId = (rows: ResolvedFeature[], id: string): ResolvedFeature[] => rows.filter((r) => r.feature.id === id);
/** `FeatureSource` is a union and only its class / subclass arms carry a level; every row read here is one of those. */
const lvlOf = (r: ResolvedFeature): number => (r.source as { level: number }).level;

/** The SRD 5e Bard's four Bardic Inspiration copies (1 / 5 / 10 / 15), each declaring the ONE resource id.
 *  `max` varies per copy ONLY so the assertions can name WHICH declaration survived; the shipped copies are
 *  byte-identical. `description` carries the copy's level for the same reason. */
const bi = (level: number, max: number) => ({
  id: "bardic-inspiration", name: "Bardic Inspiration", description: `at ${level}`,
  resources: [{ id: "bard:bardic-inspiration", name: "Bardic Inspiration", max_formula: String(max), max: String(max), reset: "long-rest" }],
});
const bard = (level: number): ResolvedClass => ({
  entity: { slug: "bard", name: "Bard", features_by_level: { "1": [bi(1, 2)], "5": [bi(5, 3)], "10": [bi(10, 4)], "15": [bi(15, 5)] } },
  level, subclass: null, choices: {},
}) as unknown as ResolvedClass;

/** A class whose `features_by_level` and `subclass` are handed in whole, for the shapes that need both. */
const mkClass = (features_by_level: Record<string, unknown[]>, level: number, opts: { subclass?: unknown; resources?: unknown[]; choices?: unknown } = {}): ResolvedClass => ({
  entity: { slug: "fighter", name: "Fighter", features_by_level, ...(opts.resources ? { resources: opts.resources } : {}) },
  level, subclass: opts.subclass ?? null, choices: opts.choices ?? {},
}) as unknown as ResolvedClass;

describe("the resolve-time fold of repeated features (spec §7.1, ruling R-G7-4)", () => {
  it("keeps ONE wrapper per id, the highest copy at or below the level, with the FIRST resource declaration", () => {
    const out = withId(collectResolvedFeatures(null, [bard(7)], null, []), "bardic-inspiration");
    expect(out).toHaveLength(1);                                   // RED FIRST: the copies at 1 and 5 both resolved
    expect(lvlOf(out[0])).toBe(5);
    expect(out[0].feature.description).toBe("at 5");               // the HIGHEST copy's identity
    // §7.1: the FIRST declaration of each resource id wins (the `resolveFeatureResources` duplicate rule, applied
    // in ASCENDING level order), so the level-1 copy's declaration is the one the wrapper carries.
    expect(out[0].feature.resources?.[0].max_formula).toBe("2");
  });

  it("level 20 keeps the level-15 copy (m1's kill row: its FIRST expect)", () => {
    const out = withId(collectResolvedFeatures(null, [bard(20)], null, []), "bardic-inspiration");
    expect(lvlOf(out[0])).toBe(15);                          // RED FIRST: the level-1 copy came first
    expect(out).toHaveLength(1);
    expect(out[0].feature.description).toBe("at 15");
  });

  it("level 1 keeps the level-1 copy (the single-copy control: green before and after)", () => {
    const out = withId(collectResolvedFeatures(null, [bard(1)], null, []), "bardic-inspiration");
    expect(out).toHaveLength(1);
    expect(lvlOf(out[0])).toBe(1);
    expect(out[0].feature.description).toBe("at 1");
    expect(out[0].feature.resources?.[0].max_formula).toBe("2");
  });

  it("a subclass id folds separately and never folds across the class id (m2's kill row)", () => {
    const expertise = (level: number) => ({ id: "expertise", name: "Expertise", description: `at ${level}` });
    const subclass = { slug: "champion", name: "Champion", features_by_level: { "3": [expertise(3)], "9": [expertise(9)] } };
    const rows = collectResolvedFeatures(null, [mkClass({ "1": [expertise(1)], "6": [expertise(6)] }, 10, { subclass })], null, []);
    const out = withId(rows, "expertise");
    expect(out).toHaveLength(2);                                   // RED FIRST: four copies resolved
    expect(out.map((r) => r.source.kind)).toEqual(["class", "subclass"]);
    expect(out.map(lvlOf)).toEqual([6, 9]);
  });

  it("the ASI slots at 4 and 8 stay TWO buildOnly wrappers", () => {
    const slot = {
      id: "ability-score-improvement", name: "Ability Score Improvement", description: "Increase an ability score, or take a feat.",
      choices: [{ kind: "select-inline", id: "asi-or-feat", options: [{ value: "asi", label: "Ability Score Improvement" }, { value: "feat", label: "Feat" }] }],
    };
    const out = withId(collectResolvedFeatures(null, [mkClass({ "4": [slot], "8": [slot] }, 10)], null, []), "ability-score-improvement");
    expect(out).toHaveLength(2);
    expect(out.every((r) => r.buildOnly === true)).toBe(true);
  });

  it("an ASI slot beside two folding copies of the same id keeps its own wrapper (the buildOnly carve-out)", () => {
    const slot = { id: "ability-score-improvement", name: "Ability Score Improvement", description: "Increase an ability score, or take a feat." };
    const bump = (level: number) => ({
      id: "ability-score-improvement", name: "Capstone Bump", description: `at ${level}`,
      effects: [{ kind: "ability-score-increase", abilities: ["str"], amount: 2, choose: null, max: null }],
    });
    const out = withId(collectResolvedFeatures(null, [mkClass({ "4": [slot], "8": [slot], "12": [bump(12)], "16": [bump(16)] }, 20)], null, []), "ability-score-improvement");
    expect(out.filter((r) => r.buildOnly === true)).toHaveLength(2);
    expect(out.filter((r) => !r.buildOnly)).toHaveLength(1);
    expect(out.filter((r) => !r.buildOnly)[0].feature.description).toBe("at 16");
  });

  it("a feature without an id never folds", () => {
    const anon = (level: number) => ({ name: "Nameless Boon", description: `at ${level}` });
    const rows = collectResolvedFeatures(null, [mkClass({ "3": [anon(3)], "7": [anon(7)] }, 10)], null, []);
    const out = rows.filter((r) => r.feature.name === "Nameless Boon");
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.feature.description)).toEqual(["at 3", "at 7"]);
  });

  it("the entity-level resources pseudo-feature survives beside a folded family", () => {
    const rows = collectResolvedFeatures(null, [mkClass({ "1": [bi(1, 2)], "5": [bi(5, 3)] }, 7, { resources: [{ id: "bard:song", name: "Song", max_formula: "1", reset: "long-rest" }] })], null, []);
    const pseudo = rows.filter((r) => r.feature.name === "Fighter" && !r.feature.id);
    expect(pseudo).toHaveLength(1);
    expect(pseudo[0].feature.resources?.[0].id).toBe("bard:song");
    expect(withId(rows, "bardic-inspiration")).toHaveLength(1);
  });

  // The PHB 2014 Cleric shape (spec §7.1, MEASURED): copies at 2 / 6 / 18 with the resource declared on the
  // level-2 copy ONLY. At level 18 the folded wrapper must still carry it.
  const cd = (level: number, withResource: boolean) => ({
    id: "channel-divinity", name: "Channel Divinity", description: `at ${level}`,
    ...(withResource ? { resources: [{ id: "cleric:channel-divinity", name: "Channel Divinity", max_formula: "2", reset: "short-rest" }] } : {}),
  });
  const cleric = mkClass({ "2": [cd(2, true)], "6": [cd(6, false)], "18": [cd(18, false)] }, 18);

  it("the Cleric channel-divinity shape folds to ONE wrapper at level 18", () => {
    expect(withId(collectResolvedFeatures(null, [cleric], null, []), "channel-divinity")).toHaveLength(1);
  });

  it("the folded channel-divinity wrapper carries the level-2 resource and the index still holds it (m3's kill row)", () => {
    const rows = collectResolvedFeatures(null, [cleric], null, []);
    expect(last(withId(rows, "channel-divinity")).feature.resources?.[0]?.id).toBe("cleric:channel-divinity");
    expect(resolveFeatureResources(rows).get("cleric:channel-divinity")?.name).toBe("Channel Divinity");
    expect(last(withId(rows, "channel-divinity")).feature.description).toBe("at 18");
  });

  // The XGE Path of the Storm Herald shape (spec §7.1, MEASURED): copies at 3 / 6 / 14 with the effects on the
  // level-6 copy ONLY.
  const aura = (level: number, effects?: unknown[]) => ({
    id: "storm-aura", name: "Storm Aura", description: `at ${level}`, ...(effects ? { effects } : {}),
  });
  const stormHerald = mkClass({ "3": [aura(3)], "6": [aura(6, [{ kind: "initiative-bonus", value: 2 }])], "14": [aura(14)] }, 14);

  it("the Storm Herald shape: the middle copy's effects reach the folded wrapper and still fold (m4's kill row)", () => {
    const rows = collectResolvedFeatures(null, [stormHerald], null, []);
    expect(last(withId(rows, "storm-aura")).feature.effects).toEqual([{ kind: "initiative-bonus", value: 2 }]);
    expect(computeFeatureEffects(rows).initiative_bonus).toBe(2);
    expect(withId(rows, "storm-aura")).toHaveLength(1);
  });

  it("chosenInline merges in ascending level order for copies at 3 and 10 (m5's kill row)", () => {
    const pick = (level: number) => ({
      id: "favored-terrain", name: "Favored Terrain", description: `at ${level}`,
      choices: [{ kind: "select-inline", id: "favored-terrain-pick", options: [{ value: "forest", label: "Forest" }, { value: "coast", label: "Coast" }] }],
    });
    const cls = mkClass({ "3": [pick(3)], "10": [pick(10)] }, 10, {
      choices: { 3: { "favored-terrain-pick": "forest" }, 10: { "favored-terrain-pick": "coast" } },
    });
    const rows = collectResolvedFeatures(null, [cls], null, []);
    expect(last(withId(rows, "favored-terrain")).chosenInline).toEqual([{ label: "Forest" }, { label: "Coast" }]);
    expect(withId(rows, "favored-terrain")).toHaveLength(1);
  });
});
