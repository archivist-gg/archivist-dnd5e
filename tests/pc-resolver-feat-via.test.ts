/**
 * R4-G7 T8 RIDER-23 (F-FEATSRC, inv-3 §6) · a feat's `FeatureSource` carries WHERE the feat was taken.
 *
 * The resolver synthesizes ONE feature per feat, named after the feat, with `source: {kind: "feat", slug}`. The sheet's
 * source line printed `Feat: <the feat's own name>` under a row titled with that same name, on every feat row (167 rows
 * on 100 of 127 S01 sheets), because the source kept no origin: `collectFeatSlugs` read `choices[<level>].feat` and
 * dropped the class and the level. `via` is `{kind: "class", slug, level}` for a class-slot pick and `{kind: "background",
 * slug}` for a 2024 background's origin feat, so the sheet can say "Fighter 4" or "Background: Soldier".
 */
import { describe, it, expect } from "vitest";
import { PCResolver, collectResolvedFeatures } from "../src/pc/pc.resolver";
import { buildMockRegistry } from "./mock-entity-registry";
import type { Character, ResolvedFeature } from "../src/pc/pc.types";
import type { FeatEntity } from "../src/feat/feat.types";

const FIGHTER = { slug: "fighter", name: "Fighter", hit_die: "d10", saving_throws: ["str", "con"], features_by_level: {} };
const WIZARD = { slug: "wizard", name: "Wizard", hit_die: "d6", saving_throws: ["int", "wis"], features_by_level: {} };
const ALERT = { slug: "alert", name: "Alert", description: "You can't be surprised." };
const TOUGH = { slug: "tough", name: "Tough", description: "Your hit point maximum increases." };
const SAVAGE = { slug: "srd-2024_savage-attacker", name: "Savage Attacker", description: "Reroll weapon damage once per turn." };
const SOLDIER = { slug: "soldier", name: "Soldier", edition: "2024", origin_feat: "[[SRD 2024/Feats/Savage Attacker]]" };
const CRIMINAL = { slug: "criminal", name: "Criminal", edition: "2024", origin_feat: "[[SRD 2024/Feats/Alert]]" };

const registry = () => buildMockRegistry([
  { slug: "fighter", entityType: "class", data: FIGHTER },
  { slug: "wizard", entityType: "class", data: WIZARD },
  { slug: "alert", entityType: "feat", data: ALERT },
  { slug: "tough", entityType: "feat", data: TOUGH },
  { slug: "srd-2024_savage-attacker", entityType: "feat", data: SAVAGE },
  { slug: "soldier", entityType: "background", data: SOLDIER },
  { slug: "criminal", entityType: "background", data: CRIMINAL },
]);

function character(over: Partial<Character>): Character {
  return {
    name: "Via", edition: "2024", race: null, subrace: null, background: null,
    class: [{ name: "[[fighter]]", level: 8, subclass: null, choices: {} }],
    abilities: { str: 14, dex: 10, con: 13, int: 10, wis: 12, cha: 8 }, ability_method: "manual",
    skills: { proficient: [], expertise: [] }, spells: { known: [], overrides: [] }, equipment: [], overrides: {},
    state: { hp: { current: 24, max: 24, temp: 0 }, hit_dice: {}, spell_slots: {}, concentration: null, conditions: [] },
    ...over,
  } as Character;
}

const featRow = (features: ResolvedFeature[], slug: string) =>
  features.find((rf) => rf.source.kind === "feat" && rf.source.slug === slug);

describe("RIDER-23 · a feat's source names the slot that granted it", () => {
  it("a class-slot pick carries {kind: class, slug, level} from the choices key", () => {
    const { character: rc } = new PCResolver(registry()).resolve(character({
      class: [{ name: "[[fighter]]", level: 8, subclass: null, choices: { 4: { feat: "[[alert]]" }, 8: { feat: "[[tough]]" } } }],
    }));
    expect(featRow(rc.features, "alert")?.source).toEqual({ kind: "feat", slug: "alert", via: { kind: "class", slug: "fighter", level: 4 } });
    expect(featRow(rc.features, "tough")?.source).toEqual({ kind: "feat", slug: "tough", via: { kind: "class", slug: "fighter", level: 8 } });
  });

  it("a feat picked at two levels (a repeatable feat) is one row that keeps its FIRST slot", () => {
    const { character: rc } = new PCResolver(registry()).resolve(character({
      class: [{ name: "[[fighter]]", level: 8, subclass: null, choices: { 4: { feat: "[[tough]]" }, 8: { feat: "[[tough]]" } } }],
    }));
    expect(rc.features.filter((rf) => rf.source.kind === "feat").map((r) => r.source))
      .toEqual([{ kind: "feat", slug: "tough", via: { kind: "class", slug: "fighter", level: 4 } }]);
  });

  it("a multiclass pick names ITS class and that class's level key", () => {
    const { character: rc } = new PCResolver(registry()).resolve(character({
      class: [
        { name: "[[fighter]]", level: 4, subclass: null, choices: {} },
        { name: "[[wizard]]", level: 4, subclass: null, choices: { 4: { feat: "[[alert]]" } } },
      ],
    }));
    expect(featRow(rc.features, "alert")?.source).toEqual({ kind: "feat", slug: "alert", via: { kind: "class", slug: "wizard", level: 4 } });
  });

  it("a 2024 background's origin feat carries {kind: background, slug}", () => {
    const { character: rc } = new PCResolver(registry()).resolve(character({ background: "[[soldier]]" }));
    expect(featRow(rc.features, "srd-2024_savage-attacker")?.source)
      .toEqual({ kind: "feat", slug: "srd-2024_savage-attacker", via: { kind: "background", slug: "soldier" } });
  });

  it("a feat that is both the origin feat and a class-slot pick is ONE row, attributed to the class slot it was listed at first", () => {
    const { character: rc } = new PCResolver(registry()).resolve(character({
      background: "[[criminal]]",
      class: [{ name: "[[fighter]]", level: 4, subclass: null, choices: { 4: { feat: "alert" } } }],
    }));
    const rows = rc.features.filter((rf) => rf.source.kind === "feat" && rf.source.slug === "alert");
    expect(rows.map((r) => r.source)).toEqual([{ kind: "feat", slug: "alert", via: { kind: "class", slug: "fighter", level: 4 } }]);
  });

  it("control: a feat handed to collectResolvedFeatures with no provenance keeps the bare source, no via key", () => {
    const out = collectResolvedFeatures(null, [], null, [ALERT as unknown as FeatEntity]);
    expect(out[0].source).toEqual({ kind: "feat", slug: "alert" });
    expect("via" in out[0].source).toBe(false);
  });
});
