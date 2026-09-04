/**
 * R4-G3b Task 6 fix 1a · `buildDecisionLedger` tolerates a ResolvedCharacter assembled without every
 * declared key.
 *
 * `ResolvedCharacter.feats` and `Character.skills` are both NON-optional in the types, but consumers
 * build the object by cast and `tests/` is typechecked by nothing, so the compiler never sees an
 * omission. Two unguarded reads shipped on that assumption and the PLUGIN's builder-step suites caught
 * them: `resolved.feats.map` (Task 3, dnd5e a2f9324) threw on 50 plugin tests across four files, and
 * `resolved.definition.skills.proficient` (Task 4, dnd5e 264abe2) on 11 in a fifth. The precedent for
 * the fix is this engine's own `computeEffectiveProficiencies`, which optional-chains the CONTAINER for
 * exactly this reason.
 *
 * The fixture is Task 3's `fabricate` shape with the key DELETED after construction, which is the plugin
 * fixtures' shape reduced to the one property that matters.
 */
import { describe, it, expect } from "vitest";
import { buildDecisionLedger } from "@archivist-gg/dnd5e/pc/pc.decision-engine";
import type { ResolvedCharacter } from "@archivist-gg/dnd5e/pc/pc.types";

const CTX = { registry: { search: () => [], getByTypeAndSlug: () => undefined } } as never;

/** A Fighter 4 whose ONE decision is the class skill row, so a completed walk is observable as content
 *  (three offered skills) rather than as the mere absence of a throw. */
function fabricate(): ResolvedCharacter {
  const entity = { slug: "srd-2024_fighter", name: "Fighter", skill_choices: { count: 2, from: ["arcana", "history", "stealth"] },
    features_by_level: { 1: [{ id: "feature", name: "A Feature", choices: [] }] }, starting_equipment: [] };
  const definition = {
    name: "T", edition: "2024", race: null, subrace: null, background: null,
    class: [{ name: "[[fighter]]", level: 4, subclass: null, choices: {} }],
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, ability_method: "manual",
    skills: { proficient: ["arcana"], expertise: [] }, spells: { known: [], overrides: [] }, equipment: [],
    overrides: {}, origin_choices: {},
    state: { hp: { current: 1, max: 1, temp: 0 }, hit_dice: {}, spell_slots: {}, concentration: null, conditions: [], exhaustion: 0, inspiration: 0, feature_uses: {} },
  };
  return {
    definition, race: null, classes: [{ entity, level: 4, subclass: null, choices: {} }], background: null,
    feats: [], totalLevel: 4, features: [{ feature: entity.features_by_level[1][0], source: { kind: "class", slug: entity.slug, level: 1 } }],
    spells: [], pools: [], weaponMasteries: [], state: definition.state,
  } as unknown as ResolvedCharacter;
}
const skillRowOptions = (r: ResolvedCharacter): string[] =>
  (buildDecisionLedger(r, CTX).classes[0].levels[0].items[0].options ?? []).map((o) => o.value);

describe("buildDecisionLedger · a ResolvedCharacter built without a declared key (R4-G3b Task 6 fix 1a)", () => {
  it("an ABSENT `feats` key does not throw (the Task 3 feat-walk hoist)", () => {
    const r = fabricate();
    delete (r as unknown as Record<string, unknown>).feats;
    // RED FIRST before fix 1a (dnd5e 1320613): threw
    // "TypeError: Cannot read properties of undefined (reading 'map')" out of the `featBySlug` hoist.
    expect(() => buildDecisionLedger(r, CTX)).not.toThrow();
    expect(skillRowOptions(r)).toEqual(["arcana", "history", "stealth"]);
  });

  it("an ABSENT `definition.skills` key does not throw (the Task 4 EffectiveSets assembly)", () => {
    const r = fabricate();
    delete (r.definition as unknown as Record<string, unknown>).skills;
    // RED FIRST before fix 1a (dnd5e 1320613): threw
    // "TypeError: Cannot read properties of undefined (reading 'proficient')" out of the skill set.
    expect(() => buildDecisionLedger(r, CTX)).not.toThrow();
    expect(skillRowOptions(r)).toEqual(["arcana", "history", "stealth"]);
  });
});
