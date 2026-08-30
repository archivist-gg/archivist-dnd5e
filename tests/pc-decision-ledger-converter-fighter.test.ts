import { describe, it, expect } from "vitest";
import { buildDecisionLedger } from "../src/pc/pc.decision-engine";
import type { ResolvedCharacter } from "../src/pc/pc.types";
import fixture from "./fixtures/converter/players-handbook-2014_class_fighter.levels1-4.json";

// Spec R4-G1a D3 / G7. The converter PHB 2014 Fighter carries the level-4 ASI as two ability-score-increase EFFECTS
// and no `choices`; the recognizer synthesizes the `feat` decision from the feature id regardless, so the ledger's
// L4 line is exactly `feat` + `martial-versatility` today and must stay so while the effects are inert. Only key /
// kind / status are pinned; options.length is registry-dependent and never asserted. Stub registry: no entities.
const stubRegistry = { search: () => [], getByTypeAndSlug: () => undefined };

function resolvedConverterFighter(level: number): ResolvedCharacter {
  const entity = { slug: fixture.slug, name: fixture.name, features_by_level: fixture.features_by_level, starting_equipment: [],
    skill_choices: { count: 2, from: ["athletics", "perception"] } };
  const definition = {
    name: "T", edition: "2014", race: null, subrace: null, background: null,
    class: [{ name: `[[${fixture.slug}]]`, level, subclass: null, choices: {} }],
    abilities: { str: 16, dex: 10, con: 14, int: 10, wis: 10, cha: 10 },
    ability_method: "manual", skills: { proficient: [], expertise: [] },
    spells: { known: [], overrides: [] }, equipment: [], overrides: {}, origin_choices: {},
    state: { hp: { current: 1, max: 1, temp: 0 }, hit_dice: {}, spell_slots: {}, concentration: null,
      conditions: [], exhaustion: 0, inspiration: 0, feature_uses: {} },
  } as unknown as ResolvedCharacter["definition"];
  const cls = { entity, level, subclass: null, choices: {} } as unknown as ResolvedCharacter["classes"][number];
  const features = Object.entries(fixture.features_by_level as Record<string, unknown[]>)
    .filter(([l]) => Number(l) <= level)
    .flatMap(([l, fs]) => fs.map((f) => ({ feature: f, source: { kind: "class", slug: entity.slug, level: Number(l) } })));
  return { definition, race: null, classes: [cls], background: null, feats: [],
    totalLevel: level, features, spells: [], pools: [], state: definition.state } as unknown as ResolvedCharacter;
}

describe("converter PHB 2014 Fighter 4 · the decision ledger is unchanged by the inert ASI arm (G7)", () => {
  it("L4 is exactly feat[select-entity/unresolved] | martial-versatility[select-inline/informational]", () => {
    const ledger = buildDecisionLedger(resolvedConverterFighter(4), { registry: stubRegistry } as never);
    // DecisionLedger.classes[n] is { classIndex, levels: Array<{ level, items }> } (the idiom of pc-decision-engine.test.ts).
    const items = ledger.classes[0].levels.flatMap((l) => l.items).filter((i) => i.level === 4);
    expect(items.map((i) => `${i.key}[${i.choice.kind}/${i.status}]`).join(" | "))
      .toBe("feat[select-entity/unresolved] | martial-versatility[select-inline/informational]");
  });
});
