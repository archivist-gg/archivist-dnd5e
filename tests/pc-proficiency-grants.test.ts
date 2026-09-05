import { describe, it, expect } from "vitest";
import { collectProficiencyGrants } from "../src/pc/pc.proficiency-grants";

const traitGranting = (effects: unknown[], kind: string, slug: string) => ({
  feature: { id: "t", name: "Some Trait", activatable: false, effects },
  source: { kind, slug },
});

describe("collectProficiencyGrants · effect buckets", () => {
  it("resolves a race source slug to the species display name", () => {
    const resolved = {
      classes: [], feats: [], race: { slug: "srd-5e_race_rock-gnome", name: "Rock Gnome", languages: { fixed: [] } },
      background: null, pools: [], state: {},
      features: [traitGranting(
        [{ kind: "proficiency", proficiency_type: "tool", value: "tinker's-tools" }], "race", "srd-5e_race_rock-gnome")],
    } as never;
    expect(collectProficiencyGrants(resolved).effectTools)
      .toEqual([{ value: "tinker's-tools", source: "Rock Gnome" }]);
  });

  it("resolves subclass and background sources, which the first draft omitted", () => {
    const resolved = {
      classes: [{ entity: { slug: "c", name: "Fighter" }, subclass: { slug: "sc", name: "Champion" }, level: 3, choices: {} }],
      feats: [], race: null, background: { slug: "bg", name: "Soldier" }, pools: [], state: {},
      features: [
        traitGranting([{ kind: "proficiency", proficiency_type: "weapon", value: "longswords" }], "subclass", "sc"),
        traitGranting([{ kind: "proficiency", proficiency_type: "language", value: "orc" }], "background", "bg"),
      ],
    } as never;
    const g = collectProficiencyGrants(resolved);
    expect(g.effectWeapons).toEqual([{ value: "longswords", source: "Champion" }]);
    expect(g.effectLanguages).toEqual([{ value: "orc", source: "Soldier" }]);
  });

  it("resolves the class and feat kinds too, closing all five", () => {
    // class is the kind recalc synthesizes for every pool boon; the feat HIT arm
    // is distinct from the Unknown MISS arm below and must be exercised.
    const resolved = {
      classes: [{ entity: { slug: "srd-5e_class_rogue", name: "Rogue" }, subclass: null, level: 1, choices: {} }],
      feats: [{ slug: "srd-5e_feat_skilled", name: "Skilled" }],
      race: null, background: null, pools: [], state: {},
      features: [
        traitGranting([{ kind: "proficiency", proficiency_type: "tool", value: "thieves'-tools" }], "class", "srd-5e_class_rogue"),
        traitGranting([{ kind: "proficiency", proficiency_type: "language", value: "orc" }], "feat", "srd-5e_feat_skilled"),
      ],
    } as never;
    const g = collectProficiencyGrants(resolved);
    expect(g.effectTools).toEqual([{ value: "thieves'-tools", source: "Rogue" }]);
    expect(g.effectLanguages).toEqual([{ value: "orc", source: "Skilled" }]);
  });

  it("falls back to Unknown for an unresolvable source slug", () => {
    const resolved = {
      classes: [], feats: [], race: null, background: null, pools: [], state: {},
      features: [traitGranting([{ kind: "proficiency", proficiency_type: "tool", value: "smith's-tools" }], "feat", "nope")],
    } as never;
    expect(collectProficiencyGrants(resolved).effectTools).toEqual([{ value: "smith's-tools", source: "Unknown" }]);
  });

  // Every authored value here is chosen so `raw !== value`, in ALL FOUR buckets.
  // A bucket whose authored form already equals its slug (e.g. the "orc" above)
  // pins nothing about routing: flipping its `useRaw` stays green. Keep it that
  // way · this is the only guard on which of the two EffectProficiencyGrant
  // fields each bucket reads, and reaching for the wrong one is silently wrong.
  it("carries the RAW authored string for armor and weapons, and the canonical slug for tools and languages", () => {
    const resolved = {
      classes: [], feats: [], race: { slug: "r", name: "R", languages: { fixed: [] } },
      background: null, pools: [], state: {},
      features: [traitGranting([
        { kind: "proficiency", proficiency_type: "armor", value: "Heavy" },
        { kind: "proficiency", proficiency_type: "weapon", value: "Light Hammers" },
        { kind: "proficiency", proficiency_type: "tool", value: "Tinker’s Tools" },
        { kind: "proficiency", proficiency_type: "language", value: "Deep Speech" },
      ], "race", "r")],
    } as never;
    const g = collectProficiencyGrants(resolved);
    expect(g.effectArmor[0].value).toBe("Heavy");             // raw, NOT "heavy"
    expect(g.effectWeapons[0].value).toBe("Light Hammers");   // raw
    expect(g.effectTools[0].value).toBe("tinker's-tools");    // normalized
    expect(g.effectLanguages[0].value).toBe("deep-speech");   // normalized, NOT "Deep Speech"
  });
});

// These pin the DISPLAY path's use of assembleEffectFeatures, which nothing else
// sees: replacing that call with `resolved.features ?? []` + `new Set()` left the
// whole suite green before they existed. Every fixture below keeps `features: []`,
// so the ONLY way a grant can reach a bucket is through the pool assembly, and the
// activatable pair is the only guard that the display honours state.active_buffs
// the same way the fold does (spec fence F3).
describe("collectProficiencyGrants · pool boons reach the display buckets", () => {
  /** One pool holding a single boon in `grants` or `selected`. Shape per
   *  ResolvedPool / ResolvedPoolEntry: assembleEffectFeatures' pushBoon reads
   *  `item.entity` (skipping an entity with no effects), `item.slug` as the
   *  feature id the buff toggle keys on, and `pool.classIndex` to attribute the
   *  synthesized source to the owning class. */
  const poolWithBoon = (
    where: "grants" | "selected",
    entity: { slug: string; name: string; activatable: boolean; effects: unknown[] },
  ) => ({
    id: "interdict-boons", label: "Interdict Boons", classIndex: 0, count: 1, anchorLevel: 1,
    selected: where === "selected" ? [{ slug: entity.slug, entity }] : [],
    available: [],
    grants: where === "grants" ? [{ slug: entity.slug, entity }] : [],
  });

  /** `features: []` is load-bearing: it forces every expectation below through
   *  the pool half of the assembly. classIndex 0 resolves the boon's synthesized
   *  `class` source to "Reaver". */
  const resolvedWith = (pool: unknown, activeBuffs?: string[]) => ({
    classes: [{ entity: { slug: "srd-5e_class_reaver", name: "Reaver" }, subclass: null, level: 1, choices: {} }],
    feats: [], race: null, background: null,
    features: [],
    pools: [pool],
    state: activeBuffs ? { active_buffs: activeBuffs } : {},
  }) as never;

  const tinkersTools = { kind: "proficiency", proficiency_type: "tool", value: "Tinker’s Tools" };

  it("surfaces a subclass-GRANTED boon's proficiency effect", () => {
    const g = collectProficiencyGrants(resolvedWith(poolWithBoon("grants", {
      slug: "iron-hide", name: "Iron Hide", activatable: false, effects: [tinkersTools],
    })));
    expect(g.effectTools).toEqual([{ value: "tinker's-tools", source: "Reaver" }]);
  });

  it("surfaces a player-SELECTED boon's proficiency effect", () => {
    const g = collectProficiencyGrants(resolvedWith(poolWithBoon("selected", {
      slug: "hand-of-war", name: "Hand of War", activatable: false,
      effects: [{ kind: "proficiency", proficiency_type: "weapon", value: "Longswords" }],
    })));
    expect(g.effectWeapons).toEqual([{ value: "Longswords", source: "Reaver" }]);
  });

  const activatableBoon = poolWithBoon("selected", {
    slug: "infernal-majesty", name: "Infernal Majesty", activatable: true, effects: [tinkersTools],
  });

  it("withholds an ACTIVATABLE boon's grant while its slug is absent from state.active_buffs", () => {
    expect(collectProficiencyGrants(resolvedWith(activatableBoon)).effectTools).toEqual([]);
  });

  it("surfaces an ACTIVATABLE boon's grant only once its slug is in state.active_buffs", () => {
    const g = collectProficiencyGrants(resolvedWith(activatableBoon, ["infernal-majesty"]));
    expect(g.effectTools).toEqual([{ value: "tinker's-tools", source: "Reaver" }]);
  });
});

// R4-G4 §9.2 · tool expertise Tier A. The authored flag reaches the DISPLAY
// grant channel, which is the one the panel and the proficiency modal read
// (`effectTools` -> computeEffectiveProficiencies' push -> ProficiencyEntry).
// The fold's skill-expertise set is a different route and stays skills-only.
describe("collectProficiencyGrants · the authored expertise flag", () => {
  it("R4-G4 §9.2: a tool effect with expertise: true reaches effectTools WITH the flag", () => {
    const resolved = {
      classes: [{ entity: { slug: "rogue", name: "Rogue" }, subclass: null, level: 6, choices: {} }],
      feats: [], race: null, background: null, pools: [], state: {},
      features: [traitGranting(
        [{ kind: "proficiency", proficiency_type: "tool", value: "thieves' tools", expertise: true }],
        "class", "rogue")],
    } as never;
    // `value` is the SLUG (toGrants maps `g.value` for the tool and language
    // buckets) and toProfSlug RETAINS the apostrophe: "thieves' tools",
    // "Thieves’ tools" and "thieves’ tools" all normalize to "thieves'-tools".
    expect(collectProficiencyGrants(resolved).effectTools)
      .toEqual([{ value: "thieves'-tools", source: "Rogue", expertise: true }]);
  });

  it("R4-G4 §9.2: a plain tool effect keeps the exact two-key shape, with no expertise key", () => {
    const resolved = {
      classes: [{ entity: { slug: "rogue", name: "Rogue" }, subclass: null, level: 1, choices: {} }],
      feats: [], race: null, background: null, pools: [], state: {},
      features: [traitGranting(
        [{ kind: "proficiency", proficiency_type: "tool", value: "thieves' tools" }], "class", "rogue")],
    } as never;
    // ABSENT, not `false`: the flag is spread in only when true, so every
    // pre-phase consumer keeps reading the shape it was written against.
    expect(Object.keys(collectProficiencyGrants(resolved).effectTools[0])).toEqual(["value", "source"]);
  });
});
