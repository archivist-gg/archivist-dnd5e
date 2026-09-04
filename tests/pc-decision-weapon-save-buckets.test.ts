import { describe, it, expect } from "vitest";
import { collectChosenProficiencies } from "@archivist-gg/dnd5e/pc/pc.decision-engine";
import { recalc } from "../src/pc/pc.recalc";
import type { ResolvedCharacter, ChoiceValue } from "@archivist-gg/dnd5e/pc/pc.types";
import type { Choice } from "@archivist-gg/dnd5e/types/choice";

const WEAPON_MASTER = { slug: "phb-2014_feat_weapon-master", name: "Weapon Master", choices: [
  { kind: "select-entity", id: "weapon", entity_type: "weapon", count: 4 } ] };
const RESILIENT = { slug: "phb-2024_feat_resilient", name: "Resilient", choices: [
  { kind: "select-proficiency", id: "save", count: 1, domain: "save", from: ["str", "dex", "con", "int", "wis", "cha"] },
] };   // declared HERE (this file is self-contained; Task 3's file no longer carries it · Gate 2 I-6)
/** The L1 class-feature CHOICE a 2024 Fighter carries. Annotated `: Choice` because a bare
 *  object literal widens `kind` to `string`, which `fabricate`'s `Choice[]` rejects. */
const MASTERY_CHOICE: Choice = { kind: "select-entity", id: "weapon-mastery", entity_type: "weapon", count: 3 };

function fabricate(opts: {
  feats?: unknown[]; classPersisted?: Record<number, Record<string, ChoiceValue>>;
  originChoices?: Record<string, ChoiceValue>; originFeatSlug?: string; featureChoices?: Choice[];
}): ResolvedCharacter {
  const entity = { slug: "srd-2024_fighter", name: "Fighter", skill_choices: { count: 0, from: [] },
    features_by_level: { 1: [{ id: "feature", name: "A Feature", choices: opts.featureChoices ?? [] }] }, starting_equipment: [] };
  const definition = {
    name: "T", edition: "2024", race: null, subrace: null, background: opts.originFeatSlug ? "[[bg]]" : null,
    class: [{ name: "[[fighter]]", level: 4, subclass: null, choices: opts.classPersisted ?? {} }],
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, ability_method: "manual",
    skills: { proficient: ["arcana"], expertise: [] }, spells: { known: [], overrides: [] }, equipment: [],
    overrides: {}, origin_choices: opts.originChoices ?? {},
    state: { hp: { current: 1, max: 1, temp: 0 }, hit_dice: {}, spell_slots: {}, concentration: null, conditions: [], exhaustion: 0, inspiration: 0, feature_uses: {} },
  };
  const cls = { entity, level: 4, subclass: null, choices: opts.classPersisted ?? {} };
  return {
    definition, race: null, classes: [cls], background: opts.originFeatSlug ? { slug: "bg", name: "BG", origin_feat: "[[skill-expert]]" } : null,
    feats: opts.feats ?? [], totalLevel: 4, features: [{ feature: entity.features_by_level[1][0], source: { kind: "class", slug: entity.slug, level: 1 } }],
    spells: [], pools: [], weaponMasteries: [], state: definition.state,
    ...(opts.originFeatSlug ? { originFeatSlug: opts.originFeatSlug } : {}),
  } as unknown as ResolvedCharacter;
}

describe("F5 · select-entity{weapon} picks become weapon proficiencies", () => {
  it("a weapon-mastery pick grants NO proficiency (the mutant that matters)", () => {
    const r = fabricate({ featureChoices: [MASTERY_CHOICE], classPersisted: { 1: { "weapon-mastery": ["srd-2024_weapon_greatsword", "srd-2024_weapon_maul", "srd-2024_weapon_whip"] } } });
    expect(collectChosenProficiencies(r).weapons).toEqual([]);            // RED FIRST before Task 5 (264abe2): read undefined (no `weapons` bucket); under M-30: ["greatsword", "maul", "whip"]
  });
  it("Weapon Master's four picks land bare-slugged in `weapons` and in weapons.specific", () => {
    const r = fabricate({ feats: [WEAPON_MASTER], classPersisted: { 4: { feat: "[[phb-2014_feat_weapon-master]]", "feat:weapon": ["phb-2014_weapon_whip", "phb-2014_weapon_glaive", "phb-2014_weapon_lance", "phb-2014_weapon_net"] } } });
    // RED FIRST before Task 5 (264abe2): read undefined (no `weapons` bucket)
    expect(collectChosenProficiencies(r).weapons).toEqual(["whip", "glaive", "lance", "net"]);
    expect(recalc(r).proficiencies.weapons.specific).toEqual(expect.arrayContaining(["whip", "glaive", "lance", "net"]));
    expect(recalc(r).proficiencies.weapons.categories).not.toContain("whip");
  });
});
describe("F6 · a domain:save pick becomes a save proficiency", () => {
  it("Resilient (wis) → saves.wis.proficient", () => {
    const r = fabricate({ feats: [RESILIENT], classPersisted: { 4: { feat: "[[phb-2024_feat_resilient]]", "feat:save": "wis" } } });
    expect(recalc(r).saves.wis.proficient).toBe(true);                    // RED FIRST before Task 5 (264abe2): read false
    expect(collectChosenProficiencies(r).saves).toEqual(["wis"]);
  });
  it("an off-pool value grants nothing", () => {
    const r = fabricate({ feats: [RESILIENT], classPersisted: { 4: { feat: "[[phb-2024_feat_resilient]]", "feat:save": "luck" } } });
    expect(collectChosenProficiencies(r).saves).toEqual([]);              // RED FIRST before Task 5 (264abe2): read undefined (no `saves` bucket)
  });
  it("an override still wins over the pick", () => {
    const r = fabricate({ feats: [RESILIENT], classPersisted: { 4: { feat: "[[phb-2024_feat_resilient]]", "feat:save": "wis" } } });
    (r.definition as unknown as { overrides: Record<string, unknown> }).overrides = { saves: { wis: { proficient: false } } };
    expect(recalc(r).saves.wis.proficient).toBe(false);                   // a CONTROL, green before Task 5 too: it pins the union's PLACEMENT before the override read
  });
});
describe("CONTROL · filterToPool on a from-bearing class FEATURE skill row (the M-33a RED)", () => {
  it("an off-pool pick is dropped (the id is NOT `skills`: that id is reserved for the synthesized entity-level row, pc.decision-engine.ts' own warning · Gate 2 confirmation r2 M-2)", () => {
    const r = fabricate({ featureChoices: [{ kind: "select-proficiency", id: "bonus-skill", count: 1, domain: "skill", from: ["arcana", "history"] }], classPersisted: { 1: { "bonus-skill": "stealth" } } });
    expect(collectChosenProficiencies(r).skills).toEqual([]);            // a CONTROL, green before Task 5 too; under M-33a (`const valid = vals;`): ["stealth"]
  });
});
