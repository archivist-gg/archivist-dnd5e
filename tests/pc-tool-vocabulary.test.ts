import { describe, it, expect } from "vitest";
import { ARTISANS_TOOLS, MUSICAL_INSTRUMENTS, GAMING_SETS, OTHER_TOOLS, ALL_TOOLS } from "../src/types/choice";
import { toProfSlug } from "../src/pc/pc.proficiency-normalize";
import { parseClass } from "../src/class/class.parser";

describe("tool vocabulary", () => {
  it("has the SRD counts and composes in subset order", () => {
    expect(ARTISANS_TOOLS).toHaveLength(17);
    expect(MUSICAL_INSTRUMENTS).toHaveLength(10);
    expect(GAMING_SETS).toHaveLength(2);
    expect(OTHER_TOOLS).toHaveLength(6);
    expect(ALL_TOOLS).toHaveLength(35);
    expect(ALL_TOOLS).toEqual([...ARTISANS_TOOLS, ...MUSICAL_INSTRUMENTS, ...GAMING_SETS, ...OTHER_TOOLS]);
  });

  it("is already canonical and collision-free under toProfSlug", () => {
    for (const t of ALL_TOOLS) expect(toProfSlug(t)).toBe(t);
    expect(new Set(ALL_TOOLS.map(toProfSlug)).size).toBe(ALL_TOOLS.length);
  });

  it("retains apostrophes, matching the slugs background-merge already emits", () => {
    expect(ALL_TOOLS).toContain("thieves'-tools");
    expect(ALL_TOOLS).toContain("calligrapher's-supplies");
  });
});

// Gate 1 of 3 for entity-level class `choices`: the codec.
// Zod object schemas STRIP unknown keys by default (they are not passthrough) and
// `parseClass` returns `result.data`, so a `choices:` block authored in a class note
// is silently deleted at load time in the plugin unless `classEntitySchema` declares
// it. This is the gate a generator-only test can never catch.
describe("class entity-level choices survive the codec", () => {
  const bardYaml = `
name: Bard
slug: x_class_bard
edition: "2024"
source: SRD 5.2
description: An inspiring magical performer.
hit_die: d8
primary_abilities: [cha]
saving_throws: [dex, cha]
proficiencies:
  armor: []
  weapons: { categories: [simple] }
skill_choices: { count: 3, from: [acrobatics, arcana, athletics] }
starting_equipment: []
spellcasting: null
subclass_level: 3
subclass_feature_name: Bard College
weapon_mastery: null
epic_boon_level: null
table: {}
features_by_level: {}
resources: []
choices:
  - kind: select-proficiency
    id: bard-instruments
    label: Musical Instruments
    count: 3
    domain: tool
    from: [lute, flute, drum]
`;

  it("keeps a class-level select-proficiency tool choice through parseClass", () => {
    const res = parseClass(bardYaml);
    expect(res.success).toBe(true);
    if (!res.success) return;

    expect(res.data.choices).toHaveLength(1);
    expect(res.data.choices?.[0]).toMatchObject({
      kind: "select-proficiency", id: "bard-instruments", count: 3, domain: "tool",
    });
  });
});
