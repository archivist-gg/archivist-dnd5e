import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseClass } from "@archivist-gg/dnd5e/class/class.parser";

// `baseClass` is `bardYaml` from tests/pc-tool-vocabulary.test.ts with its trailing `choices:`
// block dropped and `weapon_mastery: null` kept — the ONLY parseClass YAML fixture in the suite.
// It ends in a newline so `baseClass + <block>` stays valid YAML.
const baseClass = `
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
`;

describe("class widening (§2.7) — declare-or-lose keys survive parseClass", () => {
  it("VALUE-asserts the thirteen non-trio declared keys plus image (ruling T2-carry)", () => {
    const r = parseClass(baseClass +
      `rendering_hint: ''\nhas_fluff: true\nhas_fluff_images: true\ntable_col_labels:\n  - Cantrips Known\n  - Spells Known\nstarting_equipment_additional_from_background: true\ncantrip_progression:\n  - 2\n  - 2\nprepared_spells: '<$level$> / 2 + <$int_mod$>'\nprepared_spells_change: restLong\nprepared_spells_progression:\n  - 4\n  - 5\nspells_known_progression:\n  - 4\n  - 5\nfeat_progression:\n  - name: Epic Boon\n    category:\n      - EB\n    progression:\n      '19': 1\noptionalfeature_progression:\n  - name: Eldritch Invocation\n    feature_type:\n      - EI\n    progression:\n      - 0\n      - 2\nadditional_spells:\n  - name: Magical Secrets\n    prepared:\n      '1':\n        - guidance\nimage:\n  - '[[SRD 2024/Images/Classes/Bard.webp]]'\n  - '[[SRD 2024/Images/Classes/Bard2.webp]]'\n`);
    expect(r.success).toBe(true);
    if (r.success) {
      const d = r.data as unknown as Record<string, unknown>;   // gate2 F4
      // rendering_hint carries the empty string on all 28 converter carriers: .min(1) is FORBIDDEN.
      expect(d.rendering_hint).toBe("");
      expect(d.has_fluff).toBe(true);
      expect(d.has_fluff_images).toBe(true);
      expect(d.table_col_labels).toEqual(["Cantrips Known", "Spells Known"]);
      expect(d.starting_equipment_additional_from_background).toBe(true);
      expect(d.cantrip_progression).toEqual([2, 2]);
      expect(d.prepared_spells).toBe("<$level$> / 2 + <$int_mod$>");
      expect(d.prepared_spells_change).toBe("restLong");
      expect(d.prepared_spells_progression).toEqual([4, 5]);
      expect(d.spells_known_progression).toEqual([4, 5]);
      // §9.3 · the RECORD form of `progression`…
      expect(d.feat_progression).toEqual([{ name: "Epic Boon", category: ["EB"], progression: { "19": 1 } }]);
      // …and the ARRAY form, which the measured distribution carries ONLY under
      // class.optionalfeature_progression (4 docs) — both arms of the union, at the roots that emit them.
      expect(d.optionalfeature_progression).toEqual([
        { name: "Eldritch Invocation", feature_type: ["EI"], progression: [0, 2] },
      ]);
      expect(d.additional_spells).toEqual([{ name: "Magical Secrets", prepared: { "1": ["guidance"] } }]);
      // The ARRAY arm of imageField (the single-wikilink arm is pinned on background/subclass, §9.4).
      expect(d.image).toEqual(["[[SRD 2024/Images/Classes/Bard.webp]]", "[[SRD 2024/Images/Classes/Bard2.webp]]"]);
    }
  });
  it("finding-1 trio: _fixed is number[], _allow_lower_level is BOOLEAN, _by_level is a TWO-DEEP record", () => {
    const r = parseClass(baseClass +
      `spells_known_progression_fixed:\n  - 6\n  - 2\nspells_known_progression_fixed_allow_lower_level: true\nspells_known_progression_fixed_by_level:\n  '11':\n    '6': 1\n  '13':\n    '7': 1\n`);
    expect(r.success).toBe(true);
    if (r.success) {
      const d = r.data as unknown as Record<string, unknown>;   // gate2 F4
      expect(d.spells_known_progression_fixed).toEqual([6, 2]);
      expect(d.spells_known_progression_fixed_allow_lower_level).toBe(true);
      expect(d.spells_known_progression_fixed_by_level).toEqual({ "11": { "6": 1 }, "13": { "7": 1 } });
    }
  });
  it("§9.5 class half: all four measured multiclassing arities survive verbatim, incl. {}", () => {
    for (const m of [`multiclassing: {}\n`,
      `multiclassing:\n  requirements:\n    str: 13\n`,
      `multiclassing:\n  proficiencies_gained:\n    armor:\n      - light\n`,
      `multiclassing:\n  proficiencies_gained:\n    tools:\n      - '{@item Tinker''s Tools|XPHB}'\n  requirements:\n    or:\n      - dex: 13\n        str: 13\n`]) {
      const r = parseClass(baseClass + m);
      expect(r.success).toBe(true);
      if (r.success) expect("multiclassing" in (r.data as unknown as Record<string, unknown>)).toBe(true);
    }
  });
  it("§9.6 legs 1+2: {scaling}-only parses (REFUSES today — the one deliberate flip), null parses", () => {
    expect(parseClass(baseClass.replace("weapon_mastery: null", "weapon_mastery:\n  scaling:\n    '4': 3")).success).toBe(true);
    expect(parseClass(baseClass).success).toBe(true); // baseClass carries weapon_mastery: null
  });
  it("§9.6 THIRD leg: ALL 24 SRD class records stay weapon_mastery: null (12 + 12 — gate2 F7, the phase's one non-additive edit's only corpus guard)", () => {
    for (const f of ["class.2014.json", "class.2024.json"]) {
      const raw = JSON.parse(readFileSync(resolve(__dirname, `../src/srd/data/runtime/${f}`), "utf8"));
      const records = Array.isArray(raw) ? raw : Object.values(raw);
      expect(records).toHaveLength(12);
      for (const c of records) expect((c as { weapon_mastery: unknown }).weapon_mastery).toBeNull();
    }
  });
});
