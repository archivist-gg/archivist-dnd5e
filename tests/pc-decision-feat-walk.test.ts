import { describe, it, expect } from "vitest";
import { collectChosenProficiencies, buildDecisionLedger } from "@archivist-gg/dnd5e/pc/pc.decision-engine";
import type { ResolvedCharacter, ChoiceValue } from "@archivist-gg/dnd5e/pc/pc.types";
import type { Choice } from "@archivist-gg/dnd5e/types/choice";

const SKILL_EXPERT = { slug: "phb-2024_feat_skill-expert", name: "Skill Expert", choices: [
  { kind: "select-proficiency", id: "skill-expertise", count: 1, domain: "skill", from_proficient: true, expertise: true },
] };
const SKILLED = { slug: "phb-2014_feat_skilled", name: "Skilled", choices: [
  { kind: "select-inline", id: "pick", count: 1, options: [
    { value: "lang", label: "A language", choices: [{ kind: "select-proficiency", id: "skilled-lang", count: 1, domain: "language" }] },
  ] },
] };

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

describe("visitProficiencyChoices · the chosen-FEAT arms (R4-G3b §8)", () => {
  it("THE TRAP · an ORIGIN feat's expertise pick is read under background:feat:<id>, never background:<id>", () => {
    const r = fabricate({ feats: [SKILL_EXPERT], originFeatSlug: SKILL_EXPERT.slug,
      originChoices: { "background:feat:skill-expertise": "arcana", "background:skill-expertise": "history" } });
    expect(collectChosenProficiencies(r).expertise).toEqual(["arcana"]);   // RED FIRST before Task 3 (3b17b70): read []
  });
  it("a CLASS-SLOT feat's pick is read under choices[lvl]['feat:<id>'] (a Skill Expert twin; Resilient's `saves` bucket is Task 5's own file)", () => {
    const r = fabricate({ feats: [SKILL_EXPERT],
      classPersisted: { 4: { "asi-or-feat": "feat", feat: "[[phb-2024_feat_skill-expert]]", "feat:skill-expertise": "history" } } });
    expect(collectChosenProficiencies(r).expertise).toEqual(["history"]);   // RED FIRST before Task 3 (3b17b70): read [] (Gate 2 B-4: no `.saves` before Task 5)
  });
  it("a class-slot feat's NESTED select-inline child folds (walk, not a flat visit)", () => {
    const r = fabricate({ feats: [SKILLED],
      classPersisted: { 4: { feat: "[[phb-2014_feat_skilled]]", "feat:pick": "lang", "feat:skilled-lang": "elvish" } } });
    expect(collectChosenProficiencies(r).languages).toEqual(["elvish"]);   // RED FIRST before Task 3 (3b17b70): read []
  });
  it("a [[…]]-wrapped feat ref still resolves (stripRef)", () => {
    const r = fabricate({ feats: [SKILL_EXPERT],
      classPersisted: { 4: { feat: "[[phb-2024_feat_skill-expert]]", "feat:skill-expertise": "arcana" } } });
    expect(collectChosenProficiencies(r).expertise).toEqual(["arcana"]);   // RED FIRST before Task 3 (3b17b70): read []
  });
  it("the SAME feat as origin feat AND class-slot pick folds BOTH namespaces (the stamp is outside the de-dup guard)", () => {
    const r = fabricate({ feats: [SKILL_EXPERT], originFeatSlug: SKILL_EXPERT.slug,
      originChoices: { "background:feat:skill-expertise": "arcana" },
      classPersisted: { 4: { feat: "[[phb-2024_feat_skill-expert]]", "feat:skill-expertise": "history" } } });
    // RED FIRST before Task 3 (3b17b70): read []
    expect(collectChosenProficiencies(r).expertise).toEqual(["history", "arcana"]);   // VISIT ORDER: arm (A) runs inside visitProficiencyChoices' resolved.classes.forEach, arm (B) after its `if (resolved.background)` block, and collectChosenProficiencies pushes in visit order with no sort (Gate 2 confirmation B-2; symbol form, line numbers move under this task's own insertion)
  });
  it("BUNDLE · SRD 2024 Skilled taken in an ASI slot folds the CHOSEN branch (two skills and one tool) (Gate 1 B B-2: the bundle §8 carrier)", () => {
    // Transcribed from the SHIPPED `SRD 2024/Feats/Skilled.md` fence: ONE select-inline
    // `skills-or-tools` (count 1) with FOUR options whose children REUSE the ids `skills` /
    // `tools`. Reusing the ids cannot double-fold, because `walk` recurses into the SELECTED
    // branch only · the three unchosen branches are never read.
    const SKILLED_2024 = { slug: "srd-2024_feat_skilled", name: "Skilled", repeatable: true, effects: [], choices: [
      { kind: "select-inline", id: "skills-or-tools", count: 1, options: [
        { value: "three-skills", label: "Three skills", choices: [
          { kind: "select-proficiency", id: "skills", count: 3, domain: "skill" },
        ] },
        { value: "two-skills-one-tool", label: "Two skills and one tool", choices: [
          { kind: "select-proficiency", id: "skills", count: 2, domain: "skill" },
          { kind: "select-proficiency", id: "tools", count: 1, domain: "tool" },
        ] },
        { value: "one-skill-two-tools", label: "One skill and two tools", choices: [
          { kind: "select-proficiency", id: "skills", count: 1, domain: "skill" },
          { kind: "select-proficiency", id: "tools", count: 2, domain: "tool" },
        ] },
        { value: "three-tools", label: "Three tools", choices: [
          { kind: "select-proficiency", id: "tools", count: 3, domain: "tool" },
        ] },
      ] },
    ] };
    const r = fabricate({ feats: [SKILLED_2024], classPersisted: { 4: { feat: "[[srd-2024_feat_skilled]]",
      "feat:skills-or-tools": "two-skills-one-tool", "feat:skills": ["arcana", "history"], "feat:tools": ["smiths-tools"] } } });
    // RED FIRST before Task 3 (3b17b70): both read []
    expect(collectChosenProficiencies(r).skills).toEqual(["arcana", "history"]);
    expect(collectChosenProficiencies(r).tools).toEqual(["smiths-tools"]);
  });
  it("CONTROL · a language picked under a feat is now EXCLUDED from a sibling language row (the fence's consequence)", () => {
    const r = fabricate({ feats: [SKILLED],
      classPersisted: { 4: { feat: "[[phb-2014_feat_skilled]]", "feat:pick": "lang", "feat:skilled-lang": "elvish" } },
      featureChoices: [{ kind: "select-proficiency", id: "languages", count: 1, domain: "language" }] });
    const ledger = buildDecisionLedger(r, { registry: { search: () => [], getByTypeAndSlug: () => undefined } } as never);
    const item = ledger.classes[0].levels.flatMap((l) => l.items).find((i) => i.key === "languages")!;
    // RED FIRST before Task 3 (3b17b70): the pool DID contain "elvish" (18 language options, unexcluded).
    expect(item.options.map((o) => o.value)).not.toContain("elvish");
  });
});
