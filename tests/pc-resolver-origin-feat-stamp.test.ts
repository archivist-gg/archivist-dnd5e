import { describe, it, expect } from "vitest";
import { PCResolver } from "../src/pc/pc.resolver";
import { collectChosenProficiencies } from "../src/pc/pc.decision-engine";
import { buildMockRegistry } from "./mock-entity-registry";
import type { Character } from "../src/pc/pc.types";

const SKILL_EXPERT = { slug: "skill-expert", name: "Skill Expert", choices: [
  { kind: "select-proficiency", id: "skill-expertise", count: 1, domain: "skill", from_proficient: true, expertise: true },
] };
const REG = buildMockRegistry([
  { slug: "fighter", entityType: "class", data: { slug: "fighter", name: "Fighter", skill_choices: { count: 0, from: [] }, features_by_level: {}, starting_equipment: [] } },
  { slug: "bg", entityType: "background", data: { slug: "bg", name: "BG", origin_feat: "[[skill-expert]]" } },
  { slug: "skill-expert", entityType: "feat", data: SKILL_EXPERT },
]);
const character = (): Character => ({
  name: "T", edition: "2024", race: null, subrace: null, background: "[[bg]]",
  class: [{ name: "[[fighter]]", level: 4, subclass: null, choices: { 4: { "asi-or-feat": "feat", feat: "[[skill-expert]]", "feat:skill-expertise": "history" } } }],
  abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, ability_method: "manual",
  skills: { proficient: ["arcana", "history"], expertise: [] }, spells: { known: [], overrides: [] }, equipment: [], overrides: {},
  origin_choices: { "background:feat:skill-expertise": "arcana" },
  state: { hp: { current: 1, max: 1, temp: 0 }, hit_dice: {}, spell_slots: {}, concentration: null, conditions: [], exhaustion: 0, inspiration: 0, feature_uses: {} },
} as unknown as Character);

describe("PCResolver · originFeatSlug is stamped OUTSIDE the de-dup guard (R4-G3b §8; Gate 0 B4 / Gate 2 B-3)", () => {
  it("the SAME feat as origin feat AND class-slot pick: the stamp survives the guard's skipped body and BOTH namespaces fold", () => {
    const { character: r } = new PCResolver(REG).resolve(character());
    // RED FIRST before Task 3 (3b17b70): read undefined (no such field). RED under M-35e too: the guard body does not run, so a stamp taken inside it never happens.
    expect(r.originFeatSlug).toBe("skill-expert");
    expect(r.feats.map((f) => f.slug)).toEqual(["skill-expert"]);           // the de-dup guard still yields ONE feat entry
    // RED FIRST before Task 3 (3b17b70): read []. RED under M-35e: ["history"] only.
    expect(collectChosenProficiencies(r).expertise).toEqual(["history", "arcana"]);   // VISIT ORDER: arm (A) runs inside visitProficiencyChoices' resolved.classes.forEach, arm (B) after its `if (resolved.background)` block, and collectChosenProficiencies pushes in visit order with no sort (Gate 2 confirmation B-2; symbol form, line numbers move under this task's own insertion)
  });
});
