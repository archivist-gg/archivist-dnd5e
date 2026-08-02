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
